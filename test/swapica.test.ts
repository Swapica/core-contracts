import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20Mock, Swapica } from "../generated-types/ethers";

import { cancelMatchBytes, createMatchBytes, executeMatchBytes, executeOrderBytes, signEach } from "./utils/signature";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "../scripts/utils/utils";

import {
  CancelMatchRequest,
  CreateMatchRequest,
  CreateOrderRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  State,
} from "./utils/types";

import { ETHER_ADDR, ZERO_ADDR } from "../scripts/utils/constants";

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

  describe("#createOrder", async function () {
    let createOrderRequest: CreateOrderRequest;

    beforeEach(async function () {
      createOrderRequest = {
        tokenToSell: orderToken.address,
        amountToSell: wei(1),
        tokenToBuy: matchToken.address,
        amountToBuy: wei(2),
        destinationChain: defaultChainId,
      };
    });

    it("should not create if ether amounts mismatch", async function () {
      createOrderRequest.tokenToSell = ETHER_ADDR;

      const tx = swapica.connect(orderMaker).createOrder(createOrderRequest);

      await expect(tx).to.be.revertedWith("Swapica: Wrong amount");
    });

    it("should create a token-token order properly if all conditions are met", async function () {
      const tx = swapica.connect(orderMaker).createOrder(createOrderRequest);

      await expect(tx).to.changeTokenBalances(orderToken, [orderMaker, swapica], [wei(-1), wei(1)]);

      await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, [State.AWAITING_MATCH, 0, ZERO_ADDR]);
    });

    it("should create an eth-token order properly if all conditions are met", async function () {
      createOrderRequest.tokenToSell = ETHER_ADDR;

      const tx = swapica
        .connect(orderMaker)
        .createOrder(createOrderRequest, { value: createOrderRequest.amountToSell });

      await expect(tx).to.changeEtherBalances([orderMaker, swapica], [wei(-1), wei(1)]);

      await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, [State.AWAITING_MATCH, 0, ZERO_ADDR]);
    });
  });
});
