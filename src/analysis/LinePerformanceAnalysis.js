import { resolveAccumulationZoneDefinition } from '../simulation/FormatGeometryAdapter.js';

/** Design targets and observed flow. Recovery is an explicit planning estimate. */
export function analyzeLinePerformance(equipment, result) {
  const machines = (equipment || []).filter(item => item.type !== 'CONVEYOR' && item.processData?.role !== 'CONVEYOR');
  const duration = Number(result?.durationSeconds) || 0;
  const referenceId = machines.find(item => item.type === 'PACEMAKER' || item.processData?.role === 'PACEMAKER' || item.characteristics?.isPacemaker)?.id ||
    machines.find(item => item.id === result?.summary?.lineOeePacemakerEquipmentId)?.id ||
    machines.find(item => item.type === 'FILLER')?.id || machines[0]?.id;
  const reference = machines.find(item => item.id === referenceId);
  const baselineBpm = Number(reference?.nominalRatePerSecond) * 60;
  const points = machines.map(item => {
    const configuredBpm = Number(item.nominalRatePerSecond) * 60;
    // The V-Graph shows configured machine speeds. Average production flow
    // is reported separately and must not flatten speeds to the pacemaker.
    const normalBpm = configuredBpm;
    const recovery = estimateRecoveryTarget(equipment || [], item, referenceId, normalBpm);
    const configuredMaximum = item.processData?.equipment?.maximumSpeedBpm;
    const maximumBpm = configuredMaximum === null || configuredMaximum === undefined || configuredMaximum === ''
      ? null : Number(configuredMaximum);
    const validMaximum = Number.isFinite(maximumBpm) && maximumBpm >= normalBpm && normalBpm > 0;
    const metrics = result?.equipmentMetrics?.[item.id];
    const output = Number(metrics?.outputCount);
    const stopped = Number(metrics?.stoppedSeconds);
    // Availability excludes line interactions; starvation and blocking therefore
    // reduce the operational-efficiency component of effective throughput.
    const availableSeconds = duration > 0 && Number.isFinite(stopped)
      ? Math.max(0, duration - stopped) : 0;
    const availability = duration > 0 && Number.isFinite(stopped) ? availableSeconds / duration : null;
    // Availability-only capacity estimate. Buffer recovery requires the actual
    // deviation from desired inventory and a recovery time, neither supplied here.
    // The pacemaker is the reference, not a machine to overspeed for recovery.
    const capacityEstimateBpm = item.id !== referenceId && baselineBpm > 0 && configuredBpm > 0 && availability > 0
      ? Math.max(configuredBpm, baselineBpm / availability) : null;
    const runtimeEfficiency = availableSeconds > 0 && Number.isFinite(output) && configuredBpm > 0
      ? output / (availableSeconds * configuredBpm / 60) : null;
    const observedBpm = duration > 0 && Number.isFinite(output) ? output * 60 / duration : null;
    return {
      id: item.id, name: item.name, isPacemaker: item.id === referenceId,
      normalBpm, configuredBpm, maximumBpm: validMaximum ? maximumBpm : null,
      ...recovery,
      recommendedPercent: recovery.recommendedBpm !== null && baselineBpm > 0 ? recovery.recommendedBpm / baselineBpm * 100 : null,
      recommendationExceedsMaximum: recovery.recommendedBpm !== null && validMaximum ? recovery.recommendedBpm > maximumBpm + 1e-9 : null,
      speedHeadroomPercent: validMaximum ? (maximumBpm / normalBpm - 1) * 100 : null,
      normalPercent: baselineBpm > 0 ? normalBpm / baselineBpm * 100 : null,
      maximumPercent: validMaximum && baselineBpm > 0 ? maximumBpm / baselineBpm * 100 : null,
      capacityEstimateBpm,
      capacityEstimateExceedsMaximum: capacityEstimateBpm !== null && validMaximum ? capacityEstimateBpm > maximumBpm + 1e-9 : null,
      availability, runtimeEfficiency, observedBpm,
      computedBpm: availability !== null && runtimeEfficiency !== null
        ? configuredBpm * availability * runtimeEfficiency : null,
      hasDynamicEvidence: observedBpm !== null
    };
  });
  const outletCount = Number(result?.summary?.outputCount);
  return {
    points, referenceId,
    unitOfFlow: result?.unitOfFlow || 'units',
    outletBpm: duration > 0 && Number.isFinite(outletCount) ? outletCount * 60 / duration : null,
    outputCount: Number.isFinite(outletCount) ? outletCount : null,
    durationSeconds: duration,
    hasSpeedHeadroom: points.some(point => point.speedHeadroomPercent > 0),
    hasCompleteMaxima: points.length > 0 && points.every(point => point.maximumBpm !== null),
    // The engine uses nominal speed for processing; maximum is design evidence,
    // not a simulated recovery-speed controller or a V-Graph certification.
    simulatesOverspeed: false
  };
}

function estimateRecoveryTarget(equipment, item, referenceId, normalBpm) {
  const empty = {recommendedBpm:null,recoveryUnits:null,recoveryTimeSeconds:null,recoveryBasis:'MISSING_DATA'};
  if (!(normalBpm > 0)) return empty;
  if (item.id === referenceId) return {...empty,recommendedBpm:normalBpm,recoveryUnits:0,recoveryBasis:'PACEMAKER'};
  const index = equipment.indexOf(item), referenceIndex = equipment.findIndex(e => e.id === referenceId);
  const towardReference = referenceIndex > index ? 1 : -1;
  const conveyorIndex = index + towardReference;
  const conveyor = equipment[conveyorIndex];
  if (!conveyor || conveyor.type !== 'CONVEYOR' && conveyor.processData?.role !== 'CONVEYOR')
    return {...empty,recommendedBpm:normalBpm,recoveryUnits:0,recoveryBasis:'NO_ACCUMULATION'};
  const definition = resolveAccumulationZoneDefinition(equipment, conveyorIndex).definition;
  const pitch = Number(definition?.accumulatedPitchMm);
  const usefulLength = definition?.engineering?.calculated?.usefulAccumulationLengthMm ?? definition?.usableLengthMm;
  if (!(pitch > 0) || !Number.isFinite(usefulLength) || usefulLength < 0) return empty;
  const bufferUnits = Math.floor(usefulLength / pitch);
  const reliability = item.noiseProfile?.reliability;
  // Disabled failures do not create an inferred outage, even if old MTTR values
  // are retained in processData. Missing data is not a zero-loss assumption.
  const mttr = Number(reliability?.mttrMinutes);
  const recoverySeconds = Number(item.processData?.equipment?.recoveryTimeSeconds ?? Number(reliability?.mtbfMinutes) * 60);
  if (!reliability || !Number.isFinite(mttr) || !(mttr > 0) || !Number.isFinite(recoverySeconds) || !(recoverySeconds > 0)) return empty;
  const recoveryUnits = Math.min(normalBpm * mttr, bufferUnits);
  return {
    recommendedBpm:normalBpm + recoveryUnits * 60 / recoverySeconds,
    recoveryUnits,recoveryTimeSeconds:recoverySeconds,
    recoveryBasis:item.processData?.equipment?.recoveryTimeSeconds != null ? 'EXPLICIT_RECOVERY_TIME' : 'MTBF_RECOVERY_WINDOW',
    bufferUnits,bufferCoversMeanStop:bufferUnits >= normalBpm * mttr
  };
}

