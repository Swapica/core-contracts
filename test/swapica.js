const { excpect } = require("chai");
const hardhat = require("hardhat");
const Reverter = require("./helpers/reverter.js");
const Book = artifacts.require("Swapica");
const Token = artifacts.require("ERC20Mock");

describe("CrossBook", function () {
  let book;
  let token;
  let accounts;
  const reverter = new Reverter();
  const TOTAL = 100_000;
  const AMOUNT = 123;
  const COIN = "0x1234123412341234123412341234123412341234";
  const AMOUNT2 = 12;
  const NETWORK = "rink";

  before("Deployment", async function () {
    accounts = await web3.eth.getAccounts();
    book = await Book.new();

    token = await Token.new("some token", "STKN", 27);
    await token.mint(accounts[0], TOTAL);
    await token.increaseAllowance(book.address, TOTAL);
    await reverter.snapshot();
  });
  afterEach("revert", reverter.revert);
  describe("createOrder", function () {
    it("should create order", async function () {
      let tx;
      tx = await book.createOrder(NETWORK, token.address, AMOUNT, COIN, AMOUNT2);
      expect(tx).to.emit(book, "OrderCreated").withArgs(0);
      expect(await book.orderStatus(0)).to.equal(1);
      expect((await book.orders(0)).id).to.equal(0);
      expect(await book.locked(accounts[0], token.address)).to.equal(AMOUNT);
      expect(await book.orderStatus(1)).to.equal(0);

      tx = await book.createOrder(NETWORK, token.address, AMOUNT, COIN, AMOUNT2);
      expect(tx).to.emit(book, "OrderCreated").withArgs(1);
      expect(await book.orderStatus(1)).to.equal(1);
      expect((await book.orders(1)).id).to.equal(1);
      expect(await book.locked(accounts[0], token.address)).to.equal(AMOUNT * 2);
    });
  });
  describe("cancel", function () {
    it("should cancel order", async function () {
      await book.createOrder(NETWORK, token.address, AMOUNT, COIN, AMOUNT2);
      expect(await token.balanceOf(accounts[0])).to.equal(TOTAL - AMOUNT);
      await book.cancelOrder(0);
      expect(await token.balanceOf(accounts[0])).to.equal(TOTAL);
    });
  });
});
