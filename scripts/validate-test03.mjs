import { simulateLine } from '../src/simulation/LineSimulationEngine.js';
import { createTest03ReferenceInput } from '../src/simulation/Test03Reference.js';
const response=simulateLine(createTest03ReferenceInput());
if(!response.ok)throw new Error(JSON.stringify(response.error));
const {result}=response;
// External values are from the supplied FlexSim screenshot, not a new run.
const flexSimScreenshot={outputCount:47852,finalInventories:[100,80],processingPercent:[83.39,99.86,83.08]};
console.log(JSON.stringify({engineVersion:result.engineVersion,summary:result.summary,
  comparison:{source:'User FlexSim screenshot image(9).png',flexSimScreenshot,
    outputDifference:result.summary.outputCount-flexSimScreenshot.outputCount,
    outputDifferencePercent:100*(result.summary.outputCount/flexSimScreenshot.outputCount-1),
    limitation:'Fractional fluid output and productive-equivalent capacity are not integer item counts or elapsed discrete processor states.'},
  equipmentMetrics:result.equipmentMetrics,accumulationZoneMetrics:result.accumulationZoneMetrics},null,2));
