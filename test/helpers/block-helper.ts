import { network, Web3 } from "hardhat";

const web3 = new Web3();

const setNextBlockTime = async (time: any) => {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
};

const setTime = async (time: any) => {
  await setNextBlockTime(time);
  await mine();
};

const getCurrentBlockTime = async () => {
  return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
};

const mine = async (numberOfBlocks: number = 1) => {
  for (let i = 0; i < numberOfBlocks; i++) {
    await network.provider.send("evm_mine");
  }
};

export { getCurrentBlockTime, setNextBlockTime, setTime, mine };
