// Include following line to get access to the ERC1967Proxy artifact.
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { Deployer } from "@dlsl/hardhat-migrate/dist/src/deployer/deployer";
import { Logger } from "@dlsl/hardhat-migrate/dist/src/logger/logger";
import { artifacts } from "hardhat";

const signers = ["0xA2159b461D35E2c2faA5A561dE051ba8CCC1B9e7"];
const newOwner = "0x53638975BC11de3029E46DF193d64879EAeA94eB";

const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const Swapica = artifacts.require("Swapica");

export = async (deployer: Deployer, logger: Logger) => {
  const swapica = await deployer.deploy(Swapica);
  const proxySwapica = await deployer.deploy(ERC1967Proxy, swapica.address, "0x");

  logger.logTransaction(await (await Swapica.at(proxySwapica.address)).__Swapica_init(signers), "Initialize Swapica");
  logger.logTransaction(
    await (await Swapica.at(proxySwapica.address)).transferOwnership(newOwner),
    "Transfer Ownership"
  );

  logger.logContracts(["Swapica implementation", swapica.address], ["Swapica proxy", proxySwapica.address]);
};
