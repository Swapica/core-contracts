import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ERC20Mock, Relayer, RelayerV2, Swapica } from "../generated-types/ethers";

import { createMatchBytes, executeBytes, executeMatchBytes, executeOrderBytes, signEach } from "./utils/signature";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "../scripts/utils/utils";
import { Reverter } from "./helpers/reverter";

import {
  CreateMatchRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  ExecuteParameters,
  Selector,
} from "./utils/types";

import { ETHER_ADDR, PERCENTAGE_100 } from "../scripts/utils/constants";

import { ISwapica } from "../generated-types/ethers/contracts/core/Swapica";

import CreateOrderRequestStruct = ISwapica.CreateOrderRequestStruct;

describe.only("Relayer", function () {
  const defaultChainId = BigNumber.from(31337);

  const reverter = new Reverter();

  let swapica: Swapica;
  let relayer: Relayer;
  let orderToken: ERC20Mock;
  let matchToken: ERC20Mock;
  let owner: SignerWithAddress;
  let orderMaker: SignerWithAddress;
  let matchMaker: SignerWithAddress;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;

  async function createMatch(data: CreateMatchRequest, from: SignerWithAddress, signers = [signer1, signer2]) {
    const messageBytes = createMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica
      .connect(from)
      .createMatch(messageBytes, signatures, { value: data.tokenToSell == ETHER_ADDR ? data.amountToSell : 0 });
  }

  async function executeMatch(data: ExecuteMatchRequest, signers = [signer1, signer2]) {
    const messageBytes = executeMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.interface.encodeFunctionData("executeMatch(bytes,bytes[])", [messageBytes, signatures]);
  }

  async function getExecuteOrderCallData(data: ExecuteOrderRequest, signers = [signer1, signer2]) {
    const messageBytes = executeOrderBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.interface.encodeFunctionData("executeOrder(bytes,bytes[])", [messageBytes, signatures]);
  }

  async function execute(data: ExecuteParameters, from: SignerWithAddress, signers = [signer1, signer2]) {
    const messageBytes = executeBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return relayer.connect(from).execute(messageBytes, signatures);
  }

  before(async function () {
    [owner, signer1, signer2, orderMaker, matchMaker] = await ethers.getSigners();

    const Swapica = await ethers.getContractFactory("Swapica");

    swapica = (await upgrades.deployProxy(Swapica, [[signer1.address, signer2.address]], {
      initializer: "__Swapica_init",
      kind: "uups",
    })) as unknown as Swapica;

    const Relayer = await ethers.getContractFactory("Relayer");

    relayer = (await upgrades.deployProxy(Relayer, [swapica.address], {
      initializer: "__Relayer_init",
      kind: "uups",
    })) as unknown as Relayer;

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    orderToken = await ERC20.deploy("OrderToken", "OT", 18);
    matchToken = await ERC20.deploy("MatchToken", "MT", 18);

    await orderToken.mint(orderMaker.address, wei(1000));
    await orderToken.connect(orderMaker).approve(swapica.address, wei(1000));

    await matchToken.mint(matchMaker.address, wei(1000));
    await matchToken.connect(matchMaker).approve(swapica.address, wei(1000));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("proxy functionality", function () {
    describe("#__Relayer_init", function () {
      it("should not initialize twice", async function () {
        await expect(relayer.__Relayer_init(swapica.address)).to.be.revertedWith(
          "Initializable: contract is already initialized"
        );
      });
    });

    describe("#_authorizeUpgrade", function () {
      it("should not upgrade if caller is not the owner", async function () {
        await relayer.transferOwnership(signer1.address);

        await expect(
          upgrades.upgradeProxy(relayer.address, await ethers.getContractFactory("RelayerV2"))
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should upgrade if caller is the owner", async function () {
        const RelayerV2 = await ethers.getContractFactory("RelayerV2");

        const relayerV2 = (await upgrades.upgradeProxy(relayer.address, RelayerV2)) as unknown as RelayerV2;

        expect(relayer.address).to.be.eq(relayerV2.address);
        expect(await relayerV2.RELAYER_V2_NAME()).to.be.eq("RELAYER_V2_NAME");
      });
    });
  });

  describe("relayer functionality", function () {
    context("if orders and matches are created", function () {
      beforeEach(async function () {});

      it("init", async function () {
        const createOrderRequest: CreateOrderRequestStruct = {
          tokenToSell: orderToken.address,
          amountToSell: wei(1),
          tokenToBuy: matchToken.address,
          amountToBuy: wei(2),
          destinationChain: defaultChainId,
        };

        const executeOrderRequest: ExecuteOrderRequest = {
          selector: Selector.EXECUTE_ORDER,
          chainId: defaultChainId,
          orderSwapica: swapica.address,
          orderId: 1,
          receiver: relayer.address,
          matchSwapica: swapica.address,
          matchId: 1,
        };

        await swapica.connect(orderMaker).createOrder(createOrderRequest);

        const executeParameters: ExecuteParameters = {
          token: orderToken.address,
          commission: PERCENTAGE_100.div(2),
          receiver: matchMaker.address,
          coreData: await getExecuteOrderCallData(executeOrderRequest),
        };

        await execute(executeParameters, matchMaker);

        console.log((await orderToken.balanceOf(matchMaker.address)).toString());
        console.log((await orderToken.balanceOf(relayer.address)).toString());
        console.log((await orderToken.balanceOf(swapica.address)).toString());
      });
    });
  });
});
