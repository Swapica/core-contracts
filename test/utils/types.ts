import { BigNumberish } from "ethers";

export enum Selector {
  EXECUTE_ORDER,
  EXECUTE_MATCH,
  CREATE_MATCH,
  CANCEL_MATCH,
}

export enum State {
  NONE,
  AWAITING_MATCH,
  AWAITING_FINALIZATION,
  CANCELED,
  EXECUTED,
}

export interface ExecuteOrderRequest {
  selector: Selector;
  chainId: BigNumberish;
  orderSwapica: string;
  orderId: BigNumberish;
  receiver: string;
  matchSwapica: string;
  matchId: BigNumberish;
}

export interface CreateMatchRequest {
  selector: Selector;
  chainId: BigNumberish;
  matchSwapica: string;
  orderId: BigNumberish;
  tokenToSell: string;
  amountToSell: BigNumberish;
  originChain: BigNumberish;
}

export interface CancelMatchRequest {
  selector: Selector;
  chainId: BigNumberish;
  matchSwapica: string;
  matchId: BigNumberish;
}

export interface ExecuteMatchRequest {
  selector: Selector;
  chainId: BigNumberish;
  matchSwapica: string;
  matchId: BigNumberish;
  receiver: string;
}

export interface ExecuteParameters {
  token: string;
  commission: BigNumberish;
  receiver: string;
  coreData: string;
}
