import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export interface ExecuteOrder {
  selector: number;
  chainId: BigNumber;
  orderSwapica: string;
  orderId: number;
  receiver: string;
  matchSwapica: string;
  matchId: BigNumber;
}

export interface CreateMatch {
  selector: number;
  chainId: BigNumber;
  matchSwapica: string;
  orderId: number;
  tokenToSell: string;
  amountToSell: BigNumber;
  originChain: BigNumber;
}

export interface CancelMatch {
  selector: number;
  chainId: BigNumber;
  matchSwapica: string;
  matchId: BigNumber;
}

export interface ExecuteMatch {
  selector: number;
  chainId: BigNumber;
  matchSwapica: string;
  matchId: BigNumber;
  receiver: string;
}

export async function executeOrder(signer: SignerWithAddress, data: ExecuteOrder): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(
    ["uint8", "uint256", "address", "uint256", "address", "address", "uint256"],
    [data.selector, data.chainId, data.orderSwapica, data.orderId, data.receiver, data.matchSwapica, data.matchId]
  );

  const bytes = ethers.utils.arrayify(hash);

  return signer.signMessage(bytes);
}

export async function createMatch(signer: SignerWithAddress, data: CreateMatch): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(
    ["uint8", "uint256", "address", "uint256", "address", "uint256", "uint256"],
    [
      data.selector,
      data.chainId,
      data.matchSwapica,
      data.orderId,
      data.tokenToSell,
      data.amountToSell,
      data.originChain,
    ]
  );

  const bytes = ethers.utils.arrayify(hash);

  return signer.signMessage(bytes);
}

export async function cancelMatch(signer: SignerWithAddress, data: CancelMatch): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(
    ["uint8", "uint256", "address", "uint256"],
    [data.selector, data.chainId, data.matchSwapica, data.matchId]
  );

  const bytes = ethers.utils.arrayify(hash);

  return signer.signMessage(bytes);
}

export async function executeMatch(signer: SignerWithAddress, data: ExecuteMatch): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(
    ["uint8", "uint256", "address", "uint256", "address"],
    [data.selector, data.chainId, data.matchSwapica, data.matchId, data.receiver]
  );

  const bytes = ethers.utils.arrayify(hash);

  return signer.signMessage(bytes);
}
