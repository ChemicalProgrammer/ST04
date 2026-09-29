// Reference inputs transcribed from the user's line-configuration.json.
// Do not tune these parameters to fit the external simulator.
export function createTest03ReferenceInput() {
  const ids=['equipment-mun4vgml','equipment-mun4vqdy','equipment-mun4wn7s','equipment-mun4x3cd','equipment-mun4xqn9'];
  const equipment=['FILLER','CONVEYOR','PACEMAKER','CONVEYOR','CUSTOM'].map((type,i)=>({
    id:ids[i],type,name:['Filler 01','Conveyor 01','Machine 02','Conveyor 02','Machine 03'][i],
    nominalRatePerSecond:i===2?100/60:2,initialMode:'AUTO',characteristics:{},noiseProfile:{},
    processData:type==='CONVEYOR'?{geometry:{lactMm:10000,lpPrimeMm:1000},
      upstream:{packageLengthMm:100,dischargePitchMm:120},
      speedAndSensors:{conveyorSpeedFactorVsDischargeVelocityPercent:5},
      accumulation:{conveyorSpeedFactorPercent:5}}:{}
  }));
  return {case:{id:'test-03-1790713977525',unitOfFlow:'units',equipment},
    run:{durationSeconds:28800,tickSeconds:0.25,sampleEverySeconds:1,seed:20260909,commands:[]}};
}
