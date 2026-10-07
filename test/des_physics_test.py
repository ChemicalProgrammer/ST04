"""Analytical physical checks of the real SimPy event scheduler."""
from pathlib import Path
import copy
import math
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / 'src/simulation/python'
sys.path[:0] = [str(PYTHON), str(PYTHON / 'vendor/simpy-4.1.2-py3-none-any.whl')]
from st_simpy_engine import SimPySimulation, simulate_line
from st_des_engine import simulate_line as heap_simulate


def line():
    return {'schema': 'st-des/1', 'machines': [
        {'id': 'source', 'rateBpm': 120, 'rampUpSeconds': 10},
        {'id': 'sink', 'rateBpm': 1200}],
        'conveyors': [{'id': 'belt', 'lengthMm': 1, 'speedMmPerSecond': 100, 'movingPitchMm': 1}],
        'run': {'durationSeconds': 20, 'seed': 17, 'sampleEverySeconds': 1, 'eventLogLimit': 10000}}


def first_completion(result):
    return next(e['atVirtualSecond'] for e in result['events'] if e['type'] == 'PROCESS_COMPLETED' and e.get('equipmentId') == 'source')


class PhysicsTests(unittest.TestCase):
    def check_balance(self, result):
        self.assertEqual(result['summary']['materialBalance']['residualUnits'], 0)
        for m in result['equipment']:
            self.assertAlmostEqual(sum(m['stateSeconds'].values()), result['run']['durationSeconds'])

    def test_ramp_integrates_rate_without_fixed_ticks(self):
        payload = line()
        result = simulate_line(payload)['result']
        self.assertAlmostEqual(first_completion(result), math.sqrt(10))
        flat = copy.deepcopy(payload)
        flat['machines'][0]['rampUpSeconds'] = 0
        self.assertLess(result['summary']['outputCount'], simulate_line(flat)['result']['summary']['outputCount'])
        self.check_balance(result)

    def test_failure_preserves_partial_item_and_restarts_ramp(self):
        payload = line()
        payload['machines'][0]['failures'] = [{'atSecond': 1, 'durationSeconds': 2}]
        result = simulate_line(payload)['result']
        self.assertAlmostEqual(first_completion(result), 6)  # .1 completed; .9 remains; sqrt(2*10*.9/2) = 3
        self.assertAlmostEqual(result['equipment'][0]['failureSeconds'], 2)
        self.check_balance(result)

    def test_pause_and_resume_preserve_partial_item(self):
        payload = line()
        payload['run']['commands'] = [{'atSecond': 1, 'equipmentId': 'source', 'action': 'PAUSE'},
                                     {'atSecond': 3, 'equipmentId': 'source', 'action': 'RUN'}]
        result = simulate_line(payload)['result']
        self.assertAlmostEqual(first_completion(result), 6)
        self.assertEqual(result['equipment'][0]['stateSeconds']['PAUSED'], 2)
        self.check_balance(result)

    def test_microstop_freezes_ramp_and_resumes_work(self):
        payload = line()
        payload['machines'][0]['microStop'] = {'probabilityPerMinute': 0, 'minDurationSeconds': 2, 'maxDurationSeconds': 2}
        simulation = SimPySimulation(payload)
        simulation.machines[0].micro_token = 1
        simulation.schedule(1, 2, 'MICRO_STOP', (0, 1))
        result = simulation.execute()
        self.assertAlmostEqual(first_completion(result), 2 + math.sqrt(10))
        self.assertEqual(result['equipment'][0]['microStopSeconds'], 2)
        self.assertEqual(result['equipment'][0]['microStopCount'], 1)
        self.check_balance(result)

    def test_seed_repeatability_and_sampling_independence(self):
        payload = line()
        payload['machines'][0]['microStop'] = {'probabilityPerMinute': 60, 'minDurationSeconds': .5, 'maxDurationSeconds': 1}
        a = simulate_line(payload)['result']
        b = simulate_line(payload)['result']
        self.assertEqual(a['events'], b['events'])
        self.assertGreater(a['equipment'][0]['microStopCount'], 0)
        payload['run']['sampleEverySeconds'] = .25
        c = simulate_line(payload)['result']
        self.assertEqual(a['summary']['outputCount'], c['summary']['outputCount'])
        self.assertEqual(a['events'], c['events'])
        self.check_balance(c)

    def test_two_schedulers_agree_with_ramps_and_microstops(self):
        payload = line()
        payload['machines'][0]['microStop'] = {'probabilityPerMinute': 20, 'minDurationSeconds': .2, 'maxDurationSeconds': .7}
        actual, oracle = simulate_line(payload)['result'], heap_simulate(payload)['result']
        self.assertEqual(actual['summary'], oracle['summary'])
        self.assertEqual(actual['equipment'], oracle['equipment'])
        self.assertEqual(actual['events'], oracle['events'])
        self.check_balance(actual)

    def test_invalid_ramp_or_duration_is_rejected(self):
        payload = line()
        payload['machines'][0]['rampUpSeconds'] = -1
        self.assertFalse(simulate_line(payload)['ok'])
        payload = line()
        payload['machines'][0]['microStop'] = {'probabilityPerMinute': 1, 'minDurationSeconds': 2, 'maxDurationSeconds': 1}
        self.assertFalse(simulate_line(payload)['ok'])


if __name__ == '__main__':
    unittest.main()
