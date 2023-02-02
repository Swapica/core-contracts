import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export function wei(value: string | number, decimal: number = 18) {
  return BigNumber.from(value).mul(BigNumber.from(10).pow(decimal));
}

export function fromWei(value: string | number, decimal: number = 18) {
  return BigNumber.from(value).div(BigNumber.from(10).pow(decimal));
}

export async function account(index: number) {
  return (await ethers.getSigners())[index];
}
