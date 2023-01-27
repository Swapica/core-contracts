import BigNumber from "bignumber.js";
import { Web3 } from "hardhat";

const web3 = new Web3();

const toBN = (value: string | number) => new BigNumber(value);

const wei = (value: string | number, decimal = 18) => {
  return toBN(value).times(toBN(10).pow(decimal)).toFixed();
};

const fromWei = (value: string | number, decimal: number = 18) => {
  return toBN(value).div(toBN(10).pow(decimal)).toFixed();
};

const accounts = async (index: number) => {
  return (await web3.eth.getAccounts())[index];
};

export { toBN, wei, fromWei, accounts };
