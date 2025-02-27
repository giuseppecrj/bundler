// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";

contract CounterScript is Script {
    Counter public counter;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        counter = new Counter();

        vm.stopBroadcast();

        console.log("Counter deployed at", address(counter));

        // Write address to file
        string memory addressString = vm.toString(address(counter));
        vm.writeFile("deployed-counter-address.txt", addressString);
    }
}
