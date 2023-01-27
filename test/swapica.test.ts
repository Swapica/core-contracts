import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Signers, Swapica } from "../generated-types/ethers";

describe("Signers", function () {
  async function deploy() {
    const [owner, second, third] = await ethers.getSigners();

    const Swapica = await ethers.getContractFactory("Swapica");

    const swapica: Swapica = await Swapica.deploy();

    await swapica.__Swapica_init([owner.address, third.address]);

    return { owner, second, third, swapica };
  }

  it("sample", async function () {
    const { owner, third, swapica } = await loadFixture(deploy);

    console.log(owner.address, third.address, swapica.address, await swapica.owner());

    await expect(swapica.connect(third).transferOwnership(third.address)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});
