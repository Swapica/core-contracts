// Include following line to get access to the ERC1967Proxy artifact.
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { Deployer, Logger } from "@dlsl/hardhat-migrate";
import { artifacts } from "hardhat";

const signers = ["0xA8e57e5f3437B005463c6D9Ef1C6E895eE499d09"];
const newOwner = "0xEd498E75d471C3b874461a87Bb7146453CC8175A";

const ERC1967Proxy = artifacts.require("ERC1967Proxy");
const Swapica = artifacts.require("Swapica");
const Relayer = artifacts.require("Relayer");

export = async (deployer: Deployer, logger: Logger) => {
  const swapica = await deployer.deploy(Swapica);
  const proxySwapica = await deployer.deploy(ERC1967Proxy, swapica.address, "0x");

  const relayer = await deployer.deploy(Relayer);
  const proxyRelayer = await deployer.deploy(ERC1967Proxy, relayer.address, "0x");

  logger.logTransaction(await (await Swapica.at(proxySwapica.address)).__Swapica_init(signers), "Initialize Swapica");
  logger.logTransaction(
    await (await Swapica.at(proxySwapica.address)).transferOwnership(newOwner),
    "Transfer Ownership"
  );

  logger.logTransaction(
    await (await Relayer.at(proxyRelayer.address)).__Relayer_init(proxySwapica.address),
    "Initialize Relayer"
  );
  logger.logTransaction(
    await (await Relayer.at(proxyRelayer.address)).transferOwnership(newOwner),
    "Transfer Ownership"
  );

  logger.logContracts(
    ["Swapica implementation", swapica.address],
    ["Swapica proxy", proxySwapica.address],
    ["Relayer implementation", relayer.address],
    ["Relayer proxy", proxyRelayer.address]
  );
};
