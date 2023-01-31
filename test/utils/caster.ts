import { BigNumber } from "ethers";

export function cast(o: any): any {
  if (Array.isArray(o)) {
    return o.map((e) => castStruct(e));
  }

  return castStruct(o);
}

function castStruct(o: any): any {
  const allKeys = Object.keys(o);

  if (!allKeys.some((key) => !Number.isInteger(+key)) || o instanceof BigNumber) {
    return o;
  }

  return allKeys.reduce((prevKeys: any, currentKey: string) => {
    if (Number.isInteger(+currentKey)) {
      return prevKeys;
    }

    return { ...prevKeys, [currentKey]: castStruct(o[currentKey]) };
  }, {});
}
