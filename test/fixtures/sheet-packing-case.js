// Synthetic plant-sheet-v2 line: all machine rates are bottle equivalents/min.
export function packingSheetFixture(){
 const na=()=>Array(25).fill('N/A');
 function machine(type,name,critical,speed){const row=na();Object.assign(row,{0:type,1:name,2:critical?'Y':'N',3:30,4:1,5:speed});return row;}
 function conveyor(name,length,pitch,speed){const row=na();Object.assign(row,{0:'Conveyor',1:name,2:'N',6:speed,7:20,8:6000,9:500,10:0,11:0,12:length,13:pitch,14:1,15:0,16:pitch,17:2,18:0,19:0,20:1,21:.5,22:.5,23:1,24:5});return row;}
 return {metadata:['','Line C','Format C','700 ml',12,'2026-10-19',''],rows:[machine('Filler','Filler',true,300),conveyor('Before packer',60,80,30),machine('Machine','Case Packer',false,300),conveyor('After packer',310,310,32.49),machine('Palletizer','Palletizer',false,300)]};
}
