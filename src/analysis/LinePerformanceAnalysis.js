/** Design-speed profile and observed flow, without changing the simulation engine. */
export function analyzeLinePerformance(equipment, result) {
  const machines = (equipment || []).filter(item => item.type !== 'CONVEYOR' && item.processData?.role !== 'CONVEYOR');
  const duration = Number(result?.durationSeconds) || 0;
  const referenceId = result?.summary?.lineOeePacemakerEquipmentId ||
    machines.find(item => item.type === 'PACEMAKER' || item.processData?.role === 'PACEMAKER' || item.characteristics?.isPacemaker)?.id ||
    machines.find(item => item.type === 'FILLER')?.id || machines[0]?.id;
  const reference = machines.find(item => item.id === referenceId);
  const baselineBpm = Number(reference?.nominalRatePerSecond) * 60;
  const points = machines.map(item => {
    const normalBpm = Number(item.nominalRatePerSecond) * 60;
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
    // Static capacity target: recover the pacemaker's nominal flow during the
    // machine's available time. This is not a commanded recovery speed.
    const recommendedBpm = baselineBpm > 0 && normalBpm > 0 && availability > 0
      ? Math.max(normalBpm, baselineBpm / availability) : null;
    const runtimeEfficiency = availableSeconds > 0 && Number.isFinite(output) && normalBpm > 0
      ? output / (availableSeconds * normalBpm / 60) : null;
    const observedBpm = duration > 0 && Number.isFinite(output) ? output * 60 / duration : null;
    return {
      id: item.id, name: item.name, isPacemaker: item.id === referenceId,
      normalBpm, maximumBpm: validMaximum ? maximumBpm : null,
      speedHeadroomPercent: validMaximum ? (maximumBpm / normalBpm - 1) * 100 : null,
      normalPercent: baselineBpm > 0 ? normalBpm / baselineBpm * 100 : null,
      maximumPercent: validMaximum && baselineBpm > 0 ? maximumBpm / baselineBpm * 100 : null,
      recommendedBpm,
      recommendedPercent: recommendedBpm !== null ? recommendedBpm / baselineBpm * 100 : null,
      recommendationExceedsMaximum: recommendedBpm !== null && validMaximum ? recommendedBpm > maximumBpm + 1e-9 : null,
      availability, runtimeEfficiency, observedBpm,
      computedBpm: availability !== null && runtimeEfficiency !== null
        ? normalBpm * availability * runtimeEfficiency : null,
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
