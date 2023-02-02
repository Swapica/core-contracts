import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CancelMatchRequest, CreateMatchRequest, ExecuteMatchRequest, ExecuteOrderRequest } from "./types";

export function executeOrderBytes(data: ExecuteOrderRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "address", "uint256", "address", "address", "uint256"],
    [data.selector, data.chainId, data.orderSwapica, data.orderId, data.receiver, data.matchSwapica, data.matchId]
  );
}

export function createMatchBytes(data: CreateMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
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
}

export function cancelMatchBytes(data: CancelMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "address", "uint256"],
    [data.selector, data.chainId, data.matchSwapica, data.matchId]
  );
}

export function executeMatchBytes(data: ExecuteMatchRequest): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint8", "uint256", "address", "uint256", "address"],
    [data.selector, data.chainId, data.matchSwapica, data.matchId, data.receiver]
  );
}

export async function signEach(signers: SignerWithAddress[], message: string): Promise<string[]> {
  const hash = ethers.utils.solidityKeccak256(["bytes"], [message]);

  const bytes = ethers.utils.arrayify(hash);

  return Promise.all(signers.map(async (signer) => signer.signMessage(bytes)));
}
