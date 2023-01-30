import { ethers } from "hardhat";
import { ERC20Mock, Swapica } from "../generated-types/ethers";

import { cancelMatchBytes, createMatchBytes, executeMatchBytes, executeOrderBytes, signEach } from "./utils/signature";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "../scripts/utils/utils";

import {
  CancelMatchRequest,
  CreateMatchRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  Selector,
} from "./utils/types";

describe("Swapica", function () {
  const defaultChainId = BigNumber.from(31337);

  let swapica: Swapica;
  let orderToken: ERC20Mock;
  let matchToken: ERC20Mock;
  let owner: SignerWithAddress;
  let orderMaker: SignerWithAddress;
  let matchMaker: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;

  async function createMatch(data: CreateMatchRequest, from = owner) {
    const messageBytes = createMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    await swapica.connect(from).createMatch(messageBytes, signatures);
  }

  async function executeMatch(data: ExecuteMatchRequest, from = owner) {
    const messageBytes = executeMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    await swapica.connect(from).executeMatch(messageBytes, signatures);
  }

  async function cancelMatch(data: CancelMatchRequest, from = owner) {
    const messageBytes = cancelMatchBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    await swapica.connect(from).executeMatch(messageBytes, signatures);
  }

  async function executeOrder(data: ExecuteOrderRequest, from = owner) {
    const messageBytes = executeOrderBytes(data);

    const signatures = await signEach([signer1, signer2], messageBytes);

    await swapica.connect(from).executeMatch(messageBytes, signatures);
  }

  before(async function () {
    [owner, signer1, signer2, orderMaker, matchMaker] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const Swapica = await ethers.getContractFactory("Swapica");
    swapica = await Swapica.deploy();

    await swapica.__Swapica_init([signer1.address, signer2.address]);

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    orderToken = await ERC20.deploy("OrderToken", "OT", 18);
    matchToken = await ERC20.deploy("MatchToken", "MT", 18);

    await orderToken.mint(orderMaker.address, wei(1000));
    await orderToken.connect(orderMaker).approve(swapica.address, wei(1000));

    await matchToken.mint(matchMaker.address, wei(1000));
    await matchToken.connect(matchMaker).approve(swapica.address, wei(1000));
  });

  it("sample", async function () {
    const match: CreateMatchRequest = {
      selector: Selector.CREATE_MATCH,
      chainId: defaultChainId,
      matchSwapica: swapica.address,
      orderId: 1,
      tokenToSell: matchToken.address,
      amountToSell: wei(1),
      originChain: defaultChainId,
    };

    await createMatch(match, matchMaker);
  });
});
