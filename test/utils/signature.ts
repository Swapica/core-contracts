import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  CancelMatchRequest,
  CreateMatchRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  ExecuteParameters,
} from "./types";

export function executeOrderBytes(data: ExecuteOrderRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(uint8 selector, uint256 chainId, address orderSwapica, uint256 orderId, address receiver, address matchSwapica, uint256 matchId)",
    ],
    [data]
  );
}

export function createMatchBytes(data: CreateMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(bool useRelayer, uint8 selector, uint256 chainId, address matchSwapica, uint256 orderId, address tokenToSell, uint256 amountToSell, uint256 originChain)",
    ],
    [data]
  );
}

export function cancelMatchBytes(data: CancelMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(uint8 selector, uint256 chainId, address matchSwapica, uint256 matchId)"],
    [data]
  );
}

export function executeMatchBytes(data: ExecuteMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(uint8 selector, uint256 chainId, address matchSwapica, uint256 matchId, address receiver)"],
    [data]
  );
}

export function executeBytes(data: ExecuteParameters): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(address token, uint256 commission, address receiver, bytes coreData)"],
    [data]
  );
}

export async function signEach(signers: SignerWithAddress[], message: string): Promise<string[]> {
  const hash = ethers.utils.solidityKeccak256(["bytes"], [message]);

  const bytes = ethers.utils.arrayify(hash);

  return Promise.all(signers.map(async (signer) => signer.signMessage(bytes)));
}
