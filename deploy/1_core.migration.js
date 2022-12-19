const ERC1967Proxy = artifacts.require('ERC1967Proxy');
const Swapica = artifacts.require('Swapica');

const {logTransaction, logContracts} = require('@dlsl/hardhat-migrate');

// TODO: change signer addresses
const signers = ['0xc3E589056Ece16BCB88c6f9318e9a7343b663522'];

module.exports = async (deployer) => {
  const swapica = await deployer.deploy(Swapica);
  const proxyS = await deployer.deploy(ERC1967Proxy, swapica.address, '0x');

  logTransaction(
    await (await Swapica.at(proxyS.address)).__Swapica_init(signers),
    'Initialize Swapica',
  );

  logContracts(
    ['Swapica implementation', swapica.address],
    ['Swapica proxy', proxyS.address],
  );
};
