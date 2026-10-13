export function createSeededRandom(seed) {
  let state = normalizeSeed(seed);

  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
  };
}

function normalizeSeed(seed) {
  if (!Number.isInteger(seed)) {
    return 0;
  }

  return seed >>> 0;
}


// Stable streams isolate equipment and event families from unrelated draw order.
export function createEquipmentRandom(seed,equipmentId,eventType) {
  const key=JSON.stringify([normalizeSeed(seed),String(equipmentId),String(eventType)]);
  let hash=2166136261;
  for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return createSeededRandom(hash>>>0);
}
