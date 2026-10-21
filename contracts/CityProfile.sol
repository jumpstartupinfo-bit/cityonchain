// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract CityProfile is AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint256 public constant MAX_CONTENT_LENGTH = 1000;

    struct ProfileData {
        bytes32 contentHash;
        string content;
        bool hidden;
    }

    mapping(address => bool) public approvedNFTs;
    mapping(address => mapping(uint256 => ProfileData)) private profiles;
    /// @dev Monotonic version counter — never reset, even on clearProfile.
    mapping(address => mapping(uint256 => uint32)) private _versions;

    error ZeroAddressAdmin();
    error NotApprovedNFT(address nft);
    error ContentTooLong(uint256 length, uint256 maxLength);
    error NotTokenOwner(address nft, uint256 tokenId, address owner, address caller);
    error VersionOverflow(address nft, uint256 tokenId);

    event ApprovedNFTSet(address indexed nft, bool approved);
    event ProfileUpdated(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 contentHash,
        string content,
        uint32 version
    );
    event ProfileCleared(address indexed nft, uint256 indexed tokenId, address indexed owner);
    event ProfileHidden(address indexed nft, uint256 indexed tokenId, bool hidden);

    /// @notice Initializes the contract and grants admin permissions.
    /// @param admin Address that receives both DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddressAdmin();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @notice Approves or revokes an NFT contract for profile management.
    /// @param nft Address of the NFT contract.
    /// @param approved Whether the NFT contract is approved.
    function setApprovedNFT(address nft, bool approved) external onlyRole(ADMIN_ROLE) {
        approvedNFTs[nft] = approved;
        emit ApprovedNFTSet(nft, approved);
    }

    /// @notice Sets or updates profile content for a specific NFT token.
    /// @param nft Address of the approved NFT contract.
    /// @param tokenId Token ID whose profile is being updated.
    /// @param content Plain-text profile content (max 1000 bytes).
    function setProfile(address nft, uint256 tokenId, string calldata content) external whenNotPaused {
        if (!approvedNFTs[nft]) revert NotApprovedNFT(nft);

        uint256 contentLength = bytes(content).length;
        if (contentLength > MAX_CONTENT_LENGTH) {
            revert ContentTooLong(contentLength, MAX_CONTENT_LENGTH);
        }

        address owner = IERC721(nft).ownerOf(tokenId);
        if (msg.sender != owner) {
            revert NotTokenOwner(nft, tokenId, owner, msg.sender);
        }

        uint32 currentVersion = _versions[nft][tokenId];
        if (currentVersion == type(uint32).max) revert VersionOverflow(nft, tokenId);

        uint32 newVersion = currentVersion + 1;
        bytes32 contentHash = keccak256(bytes(content));

        _versions[nft][tokenId] = newVersion;
        profiles[nft][tokenId].contentHash = contentHash;
        profiles[nft][tokenId].content = content;

        emit ProfileUpdated(nft, tokenId, owner, contentHash, content, newVersion);
    }

    /// @notice Clears profile content for a specific NFT token. Version counter is preserved and continues incrementing on next setProfile.
    /// @param nft Address of the approved NFT contract.
    /// @param tokenId Token ID whose profile is being cleared.
    function clearProfile(address nft, uint256 tokenId) external whenNotPaused {
        if (!approvedNFTs[nft]) revert NotApprovedNFT(nft);

        address owner = IERC721(nft).ownerOf(tokenId);
        if (msg.sender != owner) {
            revert NotTokenOwner(nft, tokenId, owner, msg.sender);
        }

        delete profiles[nft][tokenId];

        emit ProfileCleared(nft, tokenId, owner);
    }

    /// @notice Sets hidden visibility flag for a profile.
    /// @param nft Address of the approved NFT contract.
    /// @param tokenId Token ID whose visibility is being changed.
    /// @param hidden Whether the profile should be hidden.
    function hideProfile(address nft, uint256 tokenId, bool hidden) external onlyRole(ADMIN_ROLE) {
        profiles[nft][tokenId].hidden = hidden;
        emit ProfileHidden(nft, tokenId, hidden);
    }

    /// @notice Pauses profile updates.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses profile updates.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Returns stored profile data for an NFT token.
    /// @param nft Address of the NFT contract.
    /// @param tokenId Token ID whose profile data is queried.
    /// @return contentHash Keccak-256 hash of the latest stored content.
    /// @return content Plain-text content of the profile (empty string if cleared).
    /// @return version Monotonic version counter for this token.
    /// @return hidden Whether the profile is marked hidden by an admin.
    function getProfile(address nft, uint256 tokenId)
        external
        view
        returns (bytes32 contentHash, string memory content, uint32 version, bool hidden)
    {
        ProfileData storage profile = profiles[nft][tokenId];
        return (profile.contentHash, profile.content, _versions[nft][tokenId], profile.hidden);
    }
}
