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

describe("Relayer", function () {
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

  async function createOrder(data: CreateOrderRequestStruct, from: SignerWithAddress) {
    return swapica.connect(from).createOrder(data, { value: data.tokenToSell == ETHER_ADDR ? data.amountToSell : 0 });
  }

  async function createMatch(
    data: CreateMatchRequest,
    from: SignerWithAddress,
    signers: SignerWithAddress[] = [signer1, signer2]
  ) {
    const messageBytes = createMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica
      .connect(from)
      .createMatch(messageBytes, signatures, { value: data.tokenToSell == ETHER_ADDR ? data.amountToSell : 0 });
  }

  async function getExecuteMatchCallData(data: ExecuteMatchRequest, signers: SignerWithAddress[] = [signer1, signer2]) {
    const messageBytes = executeMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.interface.encodeFunctionData("executeMatch(bytes,bytes[])", [messageBytes, signatures]);
  }

  async function getExecuteOrderCallData(data: ExecuteOrderRequest, signers: SignerWithAddress[] = [signer1, signer2]) {
    const messageBytes = executeOrderBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.interface.encodeFunctionData("executeOrder(bytes,bytes[])", [messageBytes, signatures]);
  }

  async function execute(
    data: ExecuteParameters,
    from: SignerWithAddress,
    signers: SignerWithAddress[] = [signer1, signer2]
  ) {
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
    let createOrderRequests: CreateOrderRequestStruct[];
    let createMatchRequests: CreateMatchRequest[];
    let executeOrderRequests: ExecuteOrderRequest[];
    let executeMatchRequests: ExecuteMatchRequest[];

    beforeEach(async function () {
      createOrderRequests = [
        {
          useRelayer: true,
          tokenToSell: orderToken.address,
          amountToSell: wei(1),
          tokenToBuy: matchToken.address,
          amountToBuy: wei(2),
          destinationChain: defaultChainId,
        },
        {
          useRelayer: true,
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(3),
          tokenToBuy: ETHER_ADDR,
          amountToBuy: wei(4),
          destinationChain: defaultChainId,
        },
      ];

      createMatchRequests = [
        {
          useRelayer: true,
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 1,
          tokenToSell: matchToken.address,
          amountToSell: wei(2),
          originChain: defaultChainId,
        },
        {
          useRelayer: true,
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 2,
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(4),
          originChain: defaultChainId,
        },
      ];

      executeOrderRequests = [
        {
          selector: Selector.EXECUTE_ORDER,
          chainId: defaultChainId,
          orderSwapica: swapica.address,
          orderId: 1,
          receiver: relayer.address,
          matchSwapica: swapica.address,
          matchId: 1,
        },
        {
          selector: Selector.EXECUTE_ORDER,
          chainId: defaultChainId,
          orderSwapica: swapica.address,
          orderId: 2,
          receiver: relayer.address,
          matchSwapica: swapica.address,
          matchId: 2,
        },
      ];

      executeMatchRequests = [
        {
          selector: Selector.EXECUTE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          matchId: 1,
          receiver: relayer.address,
        },
        {
          selector: Selector.EXECUTE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          matchId: 2,
          receiver: relayer.address,
        },
      ];
    });

    context("if orders and matches are created", function () {
      let executeRequests: ExecuteParameters[];

      beforeEach(async function () {
        for (const request of createOrderRequests) {
          await createOrder(request, orderMaker);
        }

        for (const request of createMatchRequests) {
          await createMatch(request, matchMaker);
        }

        executeRequests = [
          {
            token: orderToken.address,
            commission: PERCENTAGE_100.div(2),
            receiver: matchMaker.address,
            coreData: await getExecuteOrderCallData(executeOrderRequests[0]),
          },
          {
            token: ETHER_ADDR,
            commission: PERCENTAGE_100.div(10),
            receiver: matchMaker.address,
            coreData: await getExecuteOrderCallData(executeOrderRequests[1]),
          },
          {
            token: matchToken.address,
            commission: PERCENTAGE_100,
            receiver: orderMaker.address,
            coreData: await getExecuteMatchCallData(executeMatchRequests[0]),
          },
          {
            token: ETHER_ADDR,
            commission: 0,
            receiver: orderMaker.address,
            coreData: await getExecuteMatchCallData(executeMatchRequests[1]),
          },
        ];
      });

      describe("#execute", function () {
        it("should revert silently if called function does not exist", async function () {
          const invalidExecuteRequest = executeRequests[0];

          invalidExecuteRequest.coreData = "0x";

          await expect(execute(invalidExecuteRequest, owner)).to.be.revertedWith("Transaction reverted silently");
        });

        it("should revert with reason if core error occurred", async function () {
          await execute(executeRequests[0], owner);

          await expect(execute(executeRequests[0], owner)).to.be.revertedWith("Swapica: Order status is wrong");
        });

        it("should not execute if commission > 100%", async function () {
          const executeParameters: ExecuteParameters = {
            token: orderToken.address,
            commission: PERCENTAGE_100.add(1),
            receiver: matchMaker.address,
            coreData: await getExecuteOrderCallData(executeOrderRequests[0]),
          };

          await expect(execute(executeParameters, owner)).to.be.revertedWith("Relayer: commission > 100%");
        });

        it("should not execute if cannot transfer", async function () {
          const executeParameters: ExecuteParameters = {
            token: ETHER_ADDR,
            commission: PERCENTAGE_100,
            receiver: matchToken.address,
            coreData: await getExecuteOrderCallData(executeOrderRequests[1]),
          };

          await expect(execute(executeParameters, owner)).to.be.revertedWith("Transferring failed");
        });

        it("should execute properly if all conditions are met", async function () {
          await expect(execute(executeRequests[0], owner)).to.changeTokenBalances(
            orderToken,
            [swapica, relayer, matchMaker],
            [wei(-1), wei("0.5"), wei("0.5")]
          );
          await expect(execute(executeRequests[1], owner)).to.changeEtherBalances(
            [swapica, relayer, matchMaker],
            [wei(-3), wei("0.3"), wei("2.7")]
          );
          await expect(execute(executeRequests[2], owner)).to.changeTokenBalances(
            matchToken,
            [swapica, relayer, orderMaker],
            [wei(-2), wei(2), 0]
          );
          await expect(execute(executeRequests[3], owner)).to.changeEtherBalances(
            [swapica, relayer, orderMaker],
            [wei(-4), 0, wei(4)]
          );
        });
      });

      context("if orders and matches are executed", function () {
        beforeEach(async function () {
          for (const request of executeRequests) {
            await execute(request, owner);
          }
        });

        describe("#withdraw", function () {
          it("should not withdraw if caller is not the owner", async function () {
            await expect(
              relayer.connect(signer1).withdraw([ETHER_ADDR, orderToken.address, matchToken.address], owner.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("should not withdraw if cannot transfer", async function () {
            await expect(
              relayer.withdraw([ETHER_ADDR, orderToken.address, matchToken.address], swapica.address)
            ).to.be.revertedWith("Transferring failed");
          });

          it("should withdraw properly", async function () {
            const tx = relayer.withdraw([ETHER_ADDR, orderToken.address, matchToken.address], owner.address);

            await expect(tx).to.changeTokenBalances(orderToken, [relayer, owner], [wei("-0.5"), wei("0.5")]);
            await expect(tx).to.changeTokenBalances(matchToken, [relayer, owner], [wei(-2), wei(2)]);
            await expect(tx).to.changeEtherBalances([relayer, owner], [wei("-0.3"), wei("0.3")]);
          });
        });
      });
    });
  });
});
