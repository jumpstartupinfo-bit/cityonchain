// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract ActivityTracker is Ownable2Step {
    struct ActivityRecord {
        uint256 count;
        uint256 volume; // USDC 6 decimals
        uint256 lastActivity;
    }

    mapping(uint256 => ActivityRecord) public cityActivity;
    mapping(uint256 => ActivityRecord) public districtActivity;
    mapping(uint256 => mapping(uint8 => ActivityRecord)) public cityActivityByType;
    mapping(address => bool) public approvedTrackers;

    event ActivityRecorded(uint256 indexed cityId, uint256 indexed districtTokenId, uint8 indexed activityType, uint256 amount);
    event TrackerUpdated(address indexed tracker, bool approved);

    error Unauthorized();

    constructor(address _owner) Ownable(_owner) {}

    function recordActivity(uint256 cityId, uint256 districtTokenId, uint8 activityType, uint256 amount) external {
        if (!approvedTrackers[msg.sender]) revert Unauthorized();

        ActivityRecord storage cityRecord = cityActivity[cityId];
        cityRecord.count += 1;
        cityRecord.volume += amount;
        cityRecord.lastActivity = block.timestamp;

        if (districtTokenId != 0) {
            ActivityRecord storage districtRecord = districtActivity[districtTokenId];
            districtRecord.count += 1;
            districtRecord.volume += amount;
            districtRecord.lastActivity = block.timestamp;
        }

        ActivityRecord storage typedRecord = cityActivityByType[cityId][activityType];
        typedRecord.count += 1;
        typedRecord.volume += amount;
        typedRecord.lastActivity = block.timestamp;

        emit ActivityRecorded(cityId, districtTokenId, activityType, amount);
    }

    function setApprovedTracker(address tracker, bool approved) external onlyOwner {
        approvedTrackers[tracker] = approved;
        emit TrackerUpdated(tracker, approved);
    }

    function getActivityScore(uint256 cityId) external view returns (uint256) {
        ActivityRecord storage record = cityActivity[cityId];
        return record.volume + (record.count * 1e6);
    }

    function getTopCities(uint256[] calldata cityIds) external view returns (uint256[] memory scores) {
        uint256 length = cityIds.length;
        scores = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            ActivityRecord storage record = cityActivity[cityIds[i]];
            scores[i] = record.volume + (record.count * 1e6);
        }
    }

    function getCityActivityInWindow(uint256 cityId, uint256 windowStart) external view returns (uint256 count, uint256 volume) {
        ActivityRecord storage record = cityActivity[cityId];
        if (record.lastActivity >= windowStart) {
            return (record.count, record.volume);
        }
        return (0, 0);
    }
}
