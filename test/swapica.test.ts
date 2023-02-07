import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ERC20Mock, Swapica, SwapicaV2 } from "../generated-types/ethers";

import { cancelMatchBytes, createMatchBytes, executeMatchBytes, executeOrderBytes, signEach } from "./utils/signature";

import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "../scripts/utils/utils";
import { cast } from "./utils/caster";
import { Reverter } from "./helpers/reverter";

import {
  CancelMatchRequest,
  CreateMatchRequest,
  ExecuteMatchRequest,
  ExecuteOrderRequest,
  Selector,
  State,
} from "./utils/types";

import { ETHER_ADDR, ZERO_ADDR } from "../scripts/utils/constants";

import { ISwapica } from "../generated-types/ethers/contracts/core/Swapica";

import CreateOrderRequestStruct = ISwapica.CreateOrderRequestStruct;
import OrderStruct = ISwapica.OrderStruct;
import MatchStruct = ISwapica.MatchStruct;

describe("Swapica", function () {
  const defaultChainId = BigNumber.from(31337);

  const reverter = new Reverter();

  let swapica: Swapica;
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

  async function executeMatch(
    data: ExecuteMatchRequest,
    from: SignerWithAddress,
    signers: SignerWithAddress[] = [signer1, signer2]
  ) {
    const messageBytes = executeMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.connect(from).executeMatch(messageBytes, signatures);
  }

  async function cancelMatch(
    data: CancelMatchRequest,
    from: SignerWithAddress,
    signers: SignerWithAddress[] = [signer1, signer2]
  ) {
    const messageBytes = cancelMatchBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.connect(from).cancelMatch(messageBytes, signatures);
  }

  async function executeOrder(
    data: ExecuteOrderRequest,
    from: SignerWithAddress,
    signers: SignerWithAddress[] = [signer1, signer2]
  ) {
    const messageBytes = executeOrderBytes(data);

    const signatures = await signEach(signers, messageBytes);

    return swapica.connect(from).executeOrder(messageBytes, signatures);
  }

  before(async function () {
    [owner, signer1, signer2, orderMaker, matchMaker] = await ethers.getSigners();

    const Swapica = await ethers.getContractFactory("Swapica");

    swapica = (await upgrades.deployProxy(Swapica, [[signer1.address, signer2.address]], {
      initializer: "__Swapica_init",
      kind: "uups",
    })) as unknown as Swapica;

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
    describe("#__Swapica_init", function () {
      it("should not initialize twice", async function () {
        await expect(swapica.__Swapica_init([signer1.address, signer2.address])).to.be.revertedWith(
          "Initializable: contract is already initialized"
        );
      });
    });

    describe("#_authorizeUpgrade", function () {
      it("should not upgrade if caller is not the owner", async function () {
        await swapica.transferOwnership(signer1.address);

        await expect(
          upgrades.upgradeProxy(swapica.address, await ethers.getContractFactory("SwapicaV2"))
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should upgrade if caller is the owner", async function () {
        const SwapicaV2 = await ethers.getContractFactory("SwapicaV2");

        const swapicaV2 = (await upgrades.upgradeProxy(swapica.address, SwapicaV2)) as unknown as SwapicaV2;

        expect(swapica.address).to.be.eq(swapicaV2.address);
        expect(await swapicaV2.SWAPICA_V2_NAME()).to.be.eq("SWAPICA_V2_NAME");
      });
    });
  });

  describe("signers functionality", function () {
    describe("#__Signers_init", function () {
      it("should not initialize twice", async function () {
        await expect(swapica.__Signers_init([signer1.address], 1)).to.be.revertedWith(
          "Initializable: contract is not initializing"
        );
      });
    });

    describe("#setSignaturesThreshold", function () {
      it("should not set threshold if caller is not the owner", async function () {
        await expect(swapica.connect(signer1).setSignaturesThreshold(1)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should not set zero threshold", async function () {
        await expect(swapica.setSignaturesThreshold(0)).to.be.revertedWith("Signers: invalid threshold");
      });
    });

    describe("#addSigners", function () {
      it("should not add signers if caller is not the owner", async function () {
        await expect(swapica.connect(signer1).addSigners([owner.address])).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should not add zero signers", async function () {
        await expect(swapica.addSigners([ZERO_ADDR])).to.be.revertedWith("Signers: zero signer");
      });
    });

    describe("#getSigners", function () {
      it("should return signers properly", async function () {
        expect(await swapica.getSigners()).to.be.deep.eq([signer1.address, signer2.address]);
      });
    });

    describe("#removeSigners", async function () {
      it("should not remove signers if caller is not the owner", async function () {
        await expect(swapica.connect(signer1).removeSigners([signer1.address])).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should remove signers if all conditions are met", async function () {
        const createMatchRequest: CreateMatchRequest = {
          selector: Selector.CREATE_MATCH,
          chainId: defaultChainId,
          matchSwapica: swapica.address,
          orderId: 1,
          tokenToSell: ETHER_ADDR,
          amountToSell: wei(2),
          originChain: 1,
        };

        await swapica.removeSigners([signer1.address]);
        await swapica.setSignaturesThreshold(1);

        await expect(createMatch(createMatchRequest, matchMaker, [signer1])).to.be.revertedWith(
          "Signers: invalid signer"
        );

        await createMatch(createMatchRequest, matchMaker, [signer2]);

        expect(await swapica.getUserMatchesLength(matchMaker.address)).to.be.eq(1);
      });
    });
  });

  describe("swapica functionality", function () {
    describe("#createOrder", function () {
      let createOrderRequest: CreateOrderRequestStruct;

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
        const tx = createOrder(createOrderRequest, orderMaker);

        await expect(tx).to.changeTokenBalances(orderToken, [orderMaker, swapica], [wei(-1), wei(1)]);

        await expect(tx).to.emit(swapica, "OrderCreated");
      });

      it("should create an eth-token order properly if all conditions are met", async function () {
        createOrderRequest.tokenToSell = ETHER_ADDR;

        const tx = createOrder(createOrderRequest, orderMaker);

        await expect(tx).to.changeEtherBalances([orderMaker, swapica], [wei(-1), wei(1)]);

        await expect(tx).to.emit(swapica, "OrderCreated");
      });
    });

    context("if orders are created", function () {
      let createOrderRequests: CreateOrderRequestStruct[];

      beforeEach(async function () {
        createOrderRequests = [
          {
            tokenToSell: orderToken.address,
            amountToSell: wei(1),
            tokenToBuy: matchToken.address,
            amountToBuy: wei(2),
            destinationChain: defaultChainId,
          },
          {
            tokenToSell: ETHER_ADDR,
            amountToSell: wei(3),
            tokenToBuy: ETHER_ADDR,
            amountToBuy: wei(4),
            destinationChain: defaultChainId,
          },
        ];

        for (const request of createOrderRequests) {
          await createOrder(request, orderMaker);
        }
      });

      describe("#cancelOrder", function () {
        it("should not cancel order if caller is not the order creator", async function () {
          await expect(swapica.cancelOrder(1)).to.be.revertedWith("Swapica: You're not a creator of the order");
        });

        it("should cancel order if all conditions are met", async function () {
          const tx = swapica.connect(orderMaker).cancelOrder(1);

          await expect(tx).to.changeTokenBalances(orderToken, [orderMaker, swapica], [wei(1), wei(-1)]);

          await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, [State.CANCELED, 0, ZERO_ADDR]);
        });

        it("should not cancel if state is wrong", async function () {
          await swapica.connect(orderMaker).cancelOrder(1);

          await expect(swapica.connect(orderMaker).cancelOrder(1)).to.be.revertedWith("Swapica: Order status is wrong");
        });
      });

      describe("#createMatch", function () {
        let createMatchRequest: CreateMatchRequest;

        beforeEach(async function () {
          createMatchRequest = {
            selector: Selector.CREATE_MATCH,
            chainId: defaultChainId,
            matchSwapica: swapica.address,
            orderId: 1,
            tokenToSell: matchToken.address,
            amountToSell: wei(2),
            originChain: defaultChainId,
          };
        });

        it("should not create match if wrong signers", async function () {
          await expect(createMatch(createMatchRequest, matchMaker, [owner])).to.be.revertedWith(
            "Signers: invalid signer"
          );

          await expect(createMatch(createMatchRequest, matchMaker, [signer1, signer1, signer2])).to.be.revertedWith(
            "Signers: duplicate signers"
          );

          await expect(createMatch(createMatchRequest, matchMaker, [signer1])).to.be.revertedWith(
            "Signers: threshold is not met"
          );
        });

        it("should not create match if wrong selector", async function () {
          createMatchRequest.selector = Selector.CANCEL_MATCH;

          await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong selector");
        });

        it("should not create match if wrong chain id", async function () {
          createMatchRequest.chainId = 1337;

          await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong chain id");
        });

        it("should not create match if wrong swapica address", async function () {
          createMatchRequest.matchSwapica = ZERO_ADDR;

          await expect(createMatch(createMatchRequest, matchMaker)).to.be.revertedWith(
            "Swapica: Wrong swapica address"
          );
        });

        it("should create match if all conditions are met", async function () {
          const tx = createMatch(createMatchRequest, matchMaker);

          await expect(tx).to.changeTokenBalances(matchToken, [matchMaker, swapica], [wei(-2), wei(2)]);

          await expect(tx).to.emit(swapica, "MatchCreated");
        });
      });

      context("if matches are created", function () {
        let createMatchRequests: CreateMatchRequest[];

        beforeEach(async function () {
          createMatchRequests = [
            {
              selector: Selector.CREATE_MATCH,
              chainId: defaultChainId,
              matchSwapica: swapica.address,
              orderId: 1,
              tokenToSell: matchToken.address,
              amountToSell: wei(2),
              originChain: defaultChainId,
            },
            {
              selector: Selector.CREATE_MATCH,
              chainId: defaultChainId,
              matchSwapica: swapica.address,
              orderId: 2,
              tokenToSell: ETHER_ADDR,
              amountToSell: wei(4),
              originChain: defaultChainId,
            },
          ];

          for (const request of createMatchRequests) {
            await createMatch(request, matchMaker);
          }
        });

        describe("#cancelMatch", function () {
          let cancelMatchRequest: CancelMatchRequest;

          beforeEach(async function () {
            cancelMatchRequest = {
              selector: Selector.CANCEL_MATCH,
              chainId: defaultChainId,
              matchSwapica: swapica.address,
              matchId: 1,
            };
          });

          it("should not cancel match if wrong signers", async function () {
            await expect(cancelMatch(cancelMatchRequest, matchMaker, [owner])).to.be.revertedWith(
              "Signers: invalid signer"
            );

            await expect(cancelMatch(cancelMatchRequest, matchMaker, [signer1, signer1, signer2])).to.be.revertedWith(
              "Signers: duplicate signers"
            );

            await expect(cancelMatch(cancelMatchRequest, matchMaker, [signer1])).to.be.revertedWith(
              "Signers: threshold is not met"
            );
          });

          it("should not create match if wrong selector", async function () {
            cancelMatchRequest.selector = Selector.CREATE_MATCH;

            await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong selector");
          });

          it("should not create match if wrong chain id", async function () {
            cancelMatchRequest.chainId = 1337;

            await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith("Swapica: Wrong chain id");
          });

          it("should not create match if wrong swapica address", async function () {
            cancelMatchRequest.matchSwapica = ZERO_ADDR;

            await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith(
              "Swapica: Wrong swapica address"
            );
          });

          it("should not create match if caller is not a creator", async function () {
            await expect(cancelMatch(cancelMatchRequest, owner)).to.be.revertedWith(
              "Swapica: You're not a creator of the match"
            );
          });

          it("should cancel match properly if all conditions are met", async function () {
            const tx = cancelMatch(cancelMatchRequest, matchMaker);

            await expect(tx).to.changeTokenBalances(matchToken, [swapica, matchMaker], [wei(-2), wei(2)]);

            await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(1, State.CANCELED);
          });

          it("should not cancel match if wrong state", async function () {
            await cancelMatch(cancelMatchRequest, matchMaker);

            await expect(cancelMatch(cancelMatchRequest, matchMaker)).to.be.revertedWith(
              "Swapica: Match state is wrong"
            );
          });
        });

        describe("#executeMatch", function () {
          let executeMatchRequests: ExecuteMatchRequest[];

          beforeEach(async function () {
            executeMatchRequests = [
              {
                selector: Selector.EXECUTE_MATCH,
                chainId: defaultChainId,
                matchSwapica: swapica.address,
                matchId: 1,
                receiver: orderMaker.address,
              },
              {
                selector: Selector.EXECUTE_MATCH,
                chainId: defaultChainId,
                matchSwapica: swapica.address,
                matchId: 2,
                receiver: orderMaker.address,
              },
            ];
          });

          it("should not execute match if cannot transfer", async function () {
            executeMatchRequests[1].receiver = orderToken.address;

            await expect(executeMatch(executeMatchRequests[1], matchMaker)).to.be.revertedWith("Transferring failed");
          });

          it("should not execute match if wrong signers", async function () {
            await expect(executeMatch(executeMatchRequests[0], orderMaker, [owner])).to.be.revertedWith(
              "Signers: invalid signer"
            );

            await expect(
              executeMatch(executeMatchRequests[0], orderMaker, [signer1, signer1, signer2])
            ).to.be.revertedWith("Signers: duplicate signers");

            await expect(executeMatch(executeMatchRequests[0], orderMaker, [signer1])).to.be.revertedWith(
              "Signers: threshold is not met"
            );
          });

          it("should not execute match if wrong selector", async function () {
            executeMatchRequests[0].selector = Selector.EXECUTE_ORDER;

            await expect(executeMatch(executeMatchRequests[0], orderMaker)).to.be.revertedWith(
              "Swapica: Wrong selector"
            );
          });

          it("should not execute match if wrong state", async function () {
            await executeMatch(executeMatchRequests[0], orderMaker);

            await expect(executeMatch(executeMatchRequests[0], orderMaker)).to.be.revertedWith(
              "Swapica: Match status is wrong"
            );
          });

          it("should not execute match if wrong chain id", async function () {
            executeMatchRequests[0].chainId = 1337;

            await expect(executeMatch(executeMatchRequests[0], orderMaker)).to.be.revertedWith(
              "Swapica: Wrong chain id"
            );
          });

          it("should not execute match if wrong swapica address", async function () {
            executeMatchRequests[0].matchSwapica = ZERO_ADDR;

            await expect(executeMatch(executeMatchRequests[0], orderMaker)).to.be.revertedWith(
              "Swapica: Wrong swapica address"
            );
          });

          it("should execute token match properly if all conditions are met", async function () {
            const tx = executeMatch(executeMatchRequests[0], orderMaker);

            await expect(tx).to.changeTokenBalances(matchToken, [orderMaker, swapica], [wei(2), wei(-2)]);

            await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(1, State.EXECUTED);
          });

          it("should execute eth match properly if all conditions are met", async function () {
            const tx = executeMatch(executeMatchRequests[1], orderMaker);

            await expect(tx).to.changeEtherBalances([orderMaker, swapica], [wei(4), wei(-4)]);

            await expect(tx).to.emit(swapica, "MatchUpdated").withArgs(2, State.EXECUTED);
          });
        });

        describe("#executeOrder", function () {
          let executeOrderRequests: ExecuteOrderRequest[];

          beforeEach(async function () {
            executeOrderRequests = [
              {
                selector: Selector.EXECUTE_ORDER,
                chainId: defaultChainId,
                orderSwapica: swapica.address,
                orderId: 1,
                receiver: matchMaker.address,
                matchSwapica: swapica.address,
                matchId: 1,
              },
              {
                selector: Selector.EXECUTE_ORDER,
                chainId: defaultChainId,
                orderSwapica: swapica.address,
                orderId: 2,
                receiver: matchMaker.address,
                matchSwapica: swapica.address,
                matchId: 2,
              },
            ];
          });

          it("should not execute order if cannot transfer", async function () {
            executeOrderRequests[1].receiver = matchToken.address;

            await expect(executeOrder(executeOrderRequests[1], matchMaker)).to.be.revertedWith("Transferring failed");
          });

          it("should not execute order if wrong signers", async function () {
            await expect(executeOrder(executeOrderRequests[0], matchMaker, [owner])).to.be.revertedWith(
              "Signers: invalid signer"
            );

            await expect(
              executeOrder(executeOrderRequests[0], matchMaker, [signer1, signer1, signer2])
            ).to.be.revertedWith("Signers: duplicate signers");

            await expect(executeOrder(executeOrderRequests[0], matchMaker, [signer1])).to.be.revertedWith(
              "Signers: threshold is not met"
            );
          });

          it("should not execute order if wrong selector", async function () {
            executeOrderRequests[0].selector = Selector.EXECUTE_MATCH;

            await expect(executeOrder(executeOrderRequests[0], matchMaker)).to.be.revertedWith(
              "Swapica: Wrong selector"
            );
          });

          it("should not execute order if wrong state", async function () {
            await executeOrder(executeOrderRequests[0], matchMaker);

            await expect(executeOrder(executeOrderRequests[0], matchMaker)).to.be.revertedWith(
              "Swapica: Order status is wrong"
            );
          });

          it("should not execute match if wrong chain id", async function () {
            executeOrderRequests[0].chainId = 1337;

            await expect(executeOrder(executeOrderRequests[0], matchMaker)).to.be.revertedWith(
              "Swapica: Wrong chain id"
            );
          });

          it("should not execute order if wrong swapica address", async function () {
            executeOrderRequests[0].orderSwapica = ZERO_ADDR;

            await expect(executeOrder(executeOrderRequests[0], matchMaker)).to.be.revertedWith(
              "Swapica: Wrong swapica address"
            );
          });

          it("should execute token order properly if all conditions are met", async function () {
            const tx = executeOrder(executeOrderRequests[0], matchMaker);

            await expect(tx).to.changeTokenBalances(orderToken, [matchMaker, swapica], [wei(1), wei(-1)]);

            await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(1, [State.EXECUTED, 1, swapica.address]);
          });

          it("should execute eth order properly if all conditions are met", async function () {
            const tx = executeOrder(executeOrderRequests[1], matchMaker);

            await expect(tx).to.changeEtherBalances([matchMaker, swapica], [wei(3), wei(-3)]);

            await expect(tx).to.emit(swapica, "OrderUpdated").withArgs(2, [State.EXECUTED, 2, swapica.address]);
          });
        });

        describe("view functions", function () {
          let orders: OrderStruct[];
          let matches: MatchStruct[];

          beforeEach(async function () {
            orders = [
              {
                status: {
                  state: State.AWAITING_MATCH,
                  matchId: 0,
                  matchSwapica: ZERO_ADDR,
                },
                orderId: 1,
                creator: orderMaker.address,
                ...createOrderRequests[0],
              },
              {
                status: {
                  state: State.AWAITING_MATCH,
                  matchId: 0,
                  matchSwapica: ZERO_ADDR,
                },
                orderId: 2,
                creator: orderMaker.address,
                ...createOrderRequests[1],
              },
            ];

            matches = [
              {
                state: State.AWAITING_FINALIZATION,
                matchId: 1,
                originChainId: defaultChainId,
                creator: matchMaker.address,
                tokenToSell: matchToken.address,
                amountToSell: wei(2),
                originOrderId: 1,
              },
              {
                state: State.AWAITING_FINALIZATION,
                matchId: 2,
                originChainId: defaultChainId,
                creator: matchMaker.address,
                tokenToSell: ETHER_ADDR,
                amountToSell: wei(4),
                originOrderId: 2,
              },
            ];
          });

          describe("#getUserOrders #getUserOrdersLength", function () {
            it("should return whole range properly", async function () {
              expect(await swapica.getUserOrdersLength(matchMaker.address)).to.be.eq(0);
              expect(await swapica.getUserOrdersLength(orderMaker.address)).to.be.eq(2);
              expect(cast(await swapica.getUserOrders(matchMaker.address, 0, 10))).to.be.deep.eq([]);
              expect(cast(await swapica.getUserOrders(orderMaker.address, 0, 10))).to.be.deep.eq(orders);
            });

            it("should return part properly", async function () {
              expect(cast(await swapica.getUserOrders(orderMaker.address, 0, 1))).to.be.deep.eq(orders.slice(0, 1));
              expect(cast(await swapica.getUserOrders(orderMaker.address, 1, 1))).to.be.deep.eq(orders.slice(1, 2));
              expect(cast(await swapica.getUserOrders(orderMaker.address, 2, 1))).to.be.deep.eq([]);
            });
          });

          describe("#getUserMatches #getUserMatchesLength", function () {
            it("should return whole range properly", async function () {
              expect(await swapica.getUserMatchesLength(orderMaker.address)).to.be.eq(0);
              expect(await swapica.getUserMatchesLength(matchMaker.address)).to.be.eq(2);
              expect(cast(await swapica.getUserMatches(orderMaker.address, 0, 10))).to.be.deep.eq([]);
              expect(cast(await swapica.getUserMatches(matchMaker.address, 0, 10))).to.be.deep.eq(matches);
            });

            it("should return part properly", async function () {
              expect(cast(await swapica.getUserMatches(matchMaker.address, 0, 1))).to.be.deep.eq(matches.slice(0, 1));
              expect(cast(await swapica.getUserMatches(matchMaker.address, 1, 1))).to.be.deep.eq(matches.slice(1, 2));
              expect(cast(await swapica.getUserMatches(matchMaker.address, 2, 1))).to.be.deep.eq([]);
            });
          });

          describe("#getAllOrders #getAllOrdersLength", function () {
            it("should return whole range properly", async function () {
              expect(await swapica.getAllOrdersLength()).to.be.eq(2);
              expect(cast(await swapica.getAllOrders(0, 10))).to.be.deep.eq(orders);
            });

            it("should return part properly", async function () {
              expect(cast(await swapica.getAllOrders(0, 1))).to.be.deep.eq(orders.slice(0, 1));
              expect(cast(await swapica.getAllOrders(1, 1))).to.be.deep.eq(orders.slice(1, 2));
              expect(cast(await swapica.getAllOrders(1, 2))).to.be.deep.eq(orders.slice(1, 3));
              expect(cast(await swapica.getAllOrders(3, 2))).to.be.deep.eq([]);
            });
          });
        });
      });
    });
  });
});
