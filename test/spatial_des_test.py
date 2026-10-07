"""Physical regression checks for spatial SimPy DES (no browser/cloud dependencies)."""
from pathlib import Path
import copy
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'src/simulation/python'
sys.path[:0]=[str(P),str(P/'vendor/simpy-4.1.2-py3-none-any.whl')]
from st_simpy_engine import simulate_line

def line():
    return {'schema':'st-des/1','machines':[{'id':'source','rateBpm':120},{'id':'sink','rateBpm':60}],
      'conveyors':[{'id':'belt','lengthMm':1000,'speedMmPerSecond':200,'movingPitchMm':200,'accumulatedPitchMm':100,'productLengthMm':100,'primeSensorPositionMm':800,'backupSensorPositionMm':400,'blockedTimeDelaySeconds':1,'clearTimeDelaySeconds':1}],
      'run':{'durationSeconds':60,'seed':7,'sampleEverySeconds':.5,'eventLogLimit':10000},'metadata':{'conveyorModel':'SPATIAL_FINITE_PRODUCTS'}}

class SpatialTests(unittest.TestCase):
    def run_model(self,payload):
        response=simulate_line(payload);self.assertTrue(response['ok'],response.get('error'));r=response['result']
        self.assertEqual(r['summary']['materialBalance']['residualUnits'],0)
        for m in r['equipment']: self.assertAlmostEqual(sum(m['stateSeconds'].values()),payload['run']['durationSeconds'])
        for b in r['zones']: self.assertAlmostEqual(sum(b['stateSeconds'].values()),payload['run']['durationSeconds'])
        for sample in r['samples']:
            for b in sample['zones']:
                positions=b['positionsMm'];self.assertTrue(all(0<=p<=1000+1e-8 for p in positions));self.assertTrue(all(a-b>=100-1e-8 for a,b in zip(positions,positions[1:])))
        return r

    def test_prime_is_triggered_by_physical_crossing_before_outlet(self):
        r=self.run_model(line());first=next(e for e in r['events'] if e['type']=='PRIME_DETECTED')
        self.assertAlmostEqual(first['atVirtualSecond'],.5+800/200)
        self.assertGreater(r['equipment'][1]['waitingForPrimeSeconds'],0);self.assertGreater(r['summary']['outputCount'],0)

    def test_downstream_failure_builds_queue_and_stops_upstream_with_debounce(self):
        p=line();p['machines'][1]['failures']=[{'atSecond':10,'durationSeconds':15}]
        r=self.run_model(p);self.assertGreater(r['equipment'][0]['backupStopSeconds'],0)
        self.assertTrue(any(e['type']=='BACKUP_SENSOR_BLOCKED' for e in r['events']));self.assertTrue(any(e['type']=='BACKUP_SENSOR_CLEARED' for e in r['events']))
        self.assertLess(r['summary']['outputCount'],self.run_model(line())['summary']['outputCount'])

    def test_moving_sensor_pulses_do_not_trigger_false_backup_stop(self):
        p=line();p['machines'][0]['rateBpm']=60;p['conveyors'][0]['backupSensorPositionMm']=0;p['conveyors'][0]['blockedTimeDelaySeconds']=0
        r=self.run_model(p);self.assertEqual(r['equipment'][0]['backupStopSeconds'],0)
        self.assertFalse(any(e['type']=='BACKUP_SENSOR_BLOCKED' for e in r['events']))

    def test_belt_pause_freezes_product_positions_and_resumes(self):
        p=line();p['run']['commands']=[{'equipmentId':'belt','atSecond':3,'action':'PAUSE'},{'equipmentId':'belt','atSecond':8,'action':'RUN'}]
        r=self.run_model(p);frames=[s['zones'][0]['positionsMm'] for s in r['samples'] if 3<=s['virtualSecond']<8]
        self.assertTrue(all(x==frames[0] for x in frames));self.assertEqual(r['zones'][0]['stateSeconds']['PAUSED'],5)

    def test_conveyor_failure_freezes_travel(self):
        p=line();p['conveyors'][0]['failures']=[{'atSecond':3,'durationSeconds':5}]
        r=self.run_model(p);self.assertEqual(r['zones'][0]['failureCount'],1);self.assertEqual(r['zones'][0]['stateSeconds']['FAILED'],5)
        self.assertLess(r['summary']['outputCount'],self.run_model(line())['summary']['outputCount'])

    def test_residual_runout_spills_are_in_material_balance(self):
        p=line();p['machines'][1]['initialMode']='STOP';p['conveyors'][0]['backupSensorPositionMm']=0;p['conveyors'][0]['bottlesDischargedAtStop']=4;p['conveyors'][0]['upstreamStopResponseSeconds']=1
        r=self.run_model(p);self.assertGreater(r['summary']['overflowUnits'],0);self.assertEqual(r['summary']['overflowUnits'],r['summary']['materialBalance']['overflowSpilledUnits'])
        self.assertEqual(r['summary']['outputCount'],0)

    def test_belt_emergency_requires_reset_and_preserves_mode(self):
        p=line();p['run']['commands']=[{'equipmentId':'belt','atSecond':3,'action':'EMERGENCY_STOP'},{'equipmentId':'belt','atSecond':5,'action':'RUN'},{'equipmentId':'belt','atSecond':8,'action':'RESET'}]
        r=self.run_model(p);self.assertEqual(r['zones'][0]['stateSeconds']['STOPPED'],5)

    def test_ramps_and_microstops_work_with_spatial_products(self):
        p=line();p['machines'][0]['rampUpSeconds']=3;p['machines'][0]['microStop']={'probabilityPerMinute':20,'minDurationSeconds':.5,'maxDurationSeconds':1};p['conveyors'][0]['microStop']={'probabilityPerMinute':10,'minDurationSeconds':.5,'maxDurationSeconds':1}
        r=self.run_model(p);self.assertGreater(r['equipment'][0]['microStopCount'],0);self.assertGreater(r['zones'][0]['microStopCount'],0)
        self.assertEqual(r['events'],self.run_model(p)['events'])

    def test_sample_interval_does_not_change_physics(self):
        p=line();p['machines'][1]['failures']=[{'atSecond':10,'durationSeconds':15}]
        a=self.run_model(p);p['run']['sampleEverySeconds']=.7;b=self.run_model(p)
        self.assertEqual(a['summary']['outputCount'],b['summary']['outputCount']);self.assertEqual(a['summary']['overflowUnits'],b['summary']['overflowUnits'])
        self.assertAlmostEqual(a['equipment'][0]['backupStopSeconds'],b['equipment'][0]['backupStopSeconds'],places=7)

    def test_connection_start_delay_and_ramp_are_applied(self):
        p=line();p['conveyors'][0]['upstreamRestartDelaySeconds']=4;p['conveyors'][0]['downstreamRampUpSeconds']=8
        r=self.run_model(p);first=next(e for e in r['events'] if e['type']=='PRIME_DETECTED')
        self.assertAlmostEqual(first['atVirtualSecond'],4+.5+800/200)
        self.assertLess(r['summary']['outputCount'],self.run_model(line())['summary']['outputCount'])

    def test_stochastic_and_explicit_failure_calendar_are_not_combined(self):
        for target in ('machines','conveyors'):
            p=line();model=p[target][0]
            model['reliability']={'mtbfMinutes':.2,'mttrMinutes':.1}
            model['failures']=[{'atSecond':1,'durationSeconds':10}]
            self.assertFalse(simulate_line(p)['ok'])

    def test_malformed_spatial_input_returns_validation_error(self):
        for name,value in [('lengthMm','bad'),('movingPitchMm',None)]:
            p=line();p['conveyors'][0][name]=value;self.assertFalse(simulate_line(p)['ok'])

    def test_sensor_position_outside_belt_is_rejected(self):
        p=line();p['conveyors'][0]['primeSensorPositionMm']=1001;self.assertFalse(simulate_line(p)['ok'])

if __name__=='__main__':unittest.main()
