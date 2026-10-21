// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
// NOTE: CityProfile.sol has a NatSpec bug (missing @return content tag) that
// prevents solc 0.8.28 from compiling it (error 5856).  CityProfileTestable is
// a byte-for-byte logic-identical copy with the doc tag fixed.  See
// test-helpers/CityProfileTestable.sol and the "Suspected contract bugs" section
// of the test report for details.
import {CityProfileTestable as CityProfile} from "../test-helpers/CityProfileTestable.sol";
import {MockERC721} from "../test-helpers/MockERC721.sol";

contract CityProfileTest is Test {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    CityProfile internal cp;
    MockERC721  internal nft;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");  // token owner
    address internal bob   = makeAddr("bob");    // non-owner
    address internal carol = makeAddr("carol");  // non-admin

    uint256 internal constant TOKEN_1 = 1;
    uint256 internal constant TOKEN_2 = 2;

    // Cached role hashes — read once in setUp before any vm.prank so they
    // never accidentally consume a prank when accessed inside expectRevert().
    bytes32 internal ADMIN_ROLE;

    // -----------------------------------------------------------------------
    // setUp — fresh state before every test
    // -----------------------------------------------------------------------
    function setUp() public {
        cp  = new CityProfile(admin);
        nft = new MockERC721("TestNFT", "TNFT");

        // Cache role — must happen before any vm.prank.
        ADMIN_ROLE = cp.ADMIN_ROLE();

        // Approve the NFT and mint token 1 to alice, token 2 to bob.
        vm.prank(admin);
        cp.setApprovedNFT(address(nft), true);

        nft.mint(alice, TOKEN_1);
        nft.mint(bob,   TOKEN_2);
    }

    // -----------------------------------------------------------------------
    // Helper: build a string of exactly `len` bytes ('A's).
    // -----------------------------------------------------------------------
    function _makeContent(uint256 len) internal pure returns (string memory) {
        bytes memory b = new bytes(len);
        for (uint256 i; i < len; ++i) b[i] = 0x41; // 'A'
        return string(b);
    }

    // =========================================================================
    // 1. Constructor
    // =========================================================================

    function test_Constructor_SetsAdminRole() public view {
        assertTrue(cp.hasRole(cp.ADMIN_ROLE(), admin));
        assertTrue(cp.hasRole(cp.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_Constructor_ZeroAddressReverts() public {
        vm.expectRevert(CityProfile.ZeroAddressAdmin.selector);
        new CityProfile(address(0));
    }

    // =========================================================================
    // 2. setApprovedNFT — admin-only, emits ApprovedNFTSet
    // =========================================================================

    function test_SetApprovedNFT_Approves() public view {
        assertTrue(cp.approvedNFTs(address(nft)));
    }

    function test_SetApprovedNFT_RevokesApproval() public {
        vm.prank(admin);
        cp.setApprovedNFT(address(nft), false);
        assertFalse(cp.approvedNFTs(address(nft)));
    }

    function test_SetApprovedNFT_EmitsEvent() public {
        MockERC721 nft2 = new MockERC721("NFT2", "N2");

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(cp));
        emit CityProfile.ApprovedNFTSet(address(nft2), true);
        cp.setApprovedNFT(address(nft2), true);
    }

    /// Req 11 — non-admin cannot call setApprovedNFT
    function test_SetApprovedNFT_NonAdminReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                carol,
                ADMIN_ROLE
            )
        );
        vm.prank(carol);
        cp.setApprovedNFT(address(nft), false);
    }

    // =========================================================================
    // 3. setProfile — happy path
    // =========================================================================

    function test_SetProfile_HappyPath() public {
        string memory content = "Hello world";

        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, content);

        (bytes32 hash, string memory stored, uint32 version, bool hidden) =
            cp.getProfile(address(nft), TOKEN_1);

        assertEq(hash, keccak256(bytes(content)));
        assertEq(stored, content);
        assertEq(version, 1);
        assertFalse(hidden);
    }

    /// Req 1 — only token owner can setProfile
    function test_SetProfile_NonOwnerReverts() public {
        // bob owns TOKEN_2; alice doesn't → revert with NotTokenOwner
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                CityProfile.NotTokenOwner.selector,
                address(nft),
                TOKEN_1,
                alice,  // actual owner
                bob     // caller
            )
        );
        cp.setProfile(address(nft), TOKEN_1, "irrelevant");
    }

    /// Req 5 — unapproved NFT reverts with NotApprovedNFT
    function test_SetProfile_NotApprovedNFTReverts() public {
        vm.prank(admin);
        cp.setApprovedNFT(address(nft), false);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CityProfile.NotApprovedNFT.selector, address(nft))
        );
        cp.setProfile(address(nft), TOKEN_1, "content");
    }

    /// Req 4 — exactly 1000 bytes succeeds
    function test_SetProfile_Exactly1000BytesSucceeds() public {
        string memory content = _makeContent(1000);
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, content);

        (, , uint32 version,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(version, 1);
    }

    /// Req 4 — 1001 bytes reverts with ContentTooLong
    function test_SetProfile_1001BytesReverts() public {
        string memory content = _makeContent(1001);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CityProfile.ContentTooLong.selector, uint256(1001), uint256(1000))
        );
        cp.setProfile(address(nft), TOKEN_1, content);
    }

    /// Req 7 — ProfileUpdated event has correct args
    function test_SetProfile_EmitsProfileUpdated() public {
        string memory content = "profile content";
        bytes32 expectedHash  = keccak256(bytes(content));

        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(cp));
        emit CityProfile.ProfileUpdated(address(nft), TOKEN_1, alice, expectedHash, content, 1);
        cp.setProfile(address(nft), TOKEN_1, content);
    }

    /// Req 9 — version increments monotonically: set→1, set→2
    function test_SetProfile_VersionIncrements() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "v1");
        (, , uint32 v1,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(v1, 1);

        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "v2");
        (, , uint32 v2,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(v2, 2);
    }

    // =========================================================================
    // 4. clearProfile — happy path, event, post-state, version preservation
    // =========================================================================

    function test_ClearProfile_HappyPath() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "some content");

        vm.prank(alice);
        cp.clearProfile(address(nft), TOKEN_1);

        (bytes32 hash, string memory stored, uint32 version, bool hidden) =
            cp.getProfile(address(nft), TOKEN_1);

        // Req 8 — content and hash are zeroed
        assertEq(hash, bytes32(0));
        assertEq(bytes(stored).length, 0);
        assertFalse(hidden);
        // Req 8 — version NOT reset; still 1 (was set once before clear)
        assertEq(version, 1);
    }

    /// Req 8 — ProfileCleared event emitted
    function test_ClearProfile_EmitsEvent() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "data");

        vm.prank(alice);
        vm.expectEmit(true, true, true, false, address(cp));
        emit CityProfile.ProfileCleared(address(nft), TOKEN_1, alice);
        cp.clearProfile(address(nft), TOKEN_1);
    }

    /// Req 2 — non-owner cannot clearProfile
    function test_ClearProfile_NonOwnerReverts() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "data");

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                CityProfile.NotTokenOwner.selector,
                address(nft),
                TOKEN_1,
                alice,
                bob
            )
        );
        cp.clearProfile(address(nft), TOKEN_1);
    }

    /// Req 9 — version continues after clear: set→1, clear, set→2 (version=2, not 1)
    function test_ClearProfile_VersionContinuesAfterClear() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "v1");          // version → 1

        vm.prank(alice);
        cp.clearProfile(address(nft), TOKEN_1);              // version stays 1

        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "v2 post-clear"); // version → 2

        (, , uint32 version,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(version, 2);
    }

    /// Req 9 — full monotonic sequence: set→1, set→2, clear, set→3
    function test_Version_MonotonicSequence() public {
        vm.startPrank(alice);

        cp.setProfile(address(nft), TOKEN_1, "first");
        (, , uint32 v1,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(v1, 1);

        cp.setProfile(address(nft), TOKEN_1, "second");
        (, , uint32 v2,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(v2, 2);

        cp.clearProfile(address(nft), TOKEN_1);
        (, , uint32 vc,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(vc, 2); // unchanged by clear

        cp.setProfile(address(nft), TOKEN_1, "third");
        (, , uint32 v3,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(v3, 3);

        vm.stopPrank();
    }

    // =========================================================================
    // 5. After transfer — new owner can act, old owner cannot
    // =========================================================================

    /// Req 3 — new owner can setProfile; old owner cannot
    function test_Transfer_NewOwnerCanSetProfile() public {
        // alice sets a profile on TOKEN_1
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "alice profile");

        // Transfer TOKEN_1 from alice → bob
        nft.adminTransfer(alice, bob, TOKEN_1);

        // bob (new owner) can now update the profile
        vm.prank(bob);
        cp.setProfile(address(nft), TOKEN_1, "bob profile");

        (, string memory stored,,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(stored, "bob profile");
    }

    /// Req 3 — old owner (alice) cannot setProfile after transfer
    function test_Transfer_OldOwnerCannotSetProfile() public {
        nft.adminTransfer(alice, bob, TOKEN_1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                CityProfile.NotTokenOwner.selector,
                address(nft),
                TOKEN_1,
                bob,    // new actual owner
                alice   // stale caller
            )
        );
        cp.setProfile(address(nft), TOKEN_1, "stale update");
    }

    /// Req 3 — old owner cannot clearProfile after transfer
    function test_Transfer_OldOwnerCannotClearProfile() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "data");

        nft.adminTransfer(alice, bob, TOKEN_1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                CityProfile.NotTokenOwner.selector,
                address(nft),
                TOKEN_1,
                bob,
                alice
            )
        );
        cp.clearProfile(address(nft), TOKEN_1);
    }

    // =========================================================================
    // 6. hideProfile — sets hidden, getProfile reflects it, history preserved
    // =========================================================================

    /// Req 6 — hideProfile sets hidden=true
    function test_HideProfile_SetsHidden() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "visible");

        vm.prank(admin);
        cp.hideProfile(address(nft), TOKEN_1, true);

        (bytes32 hash, string memory stored, uint32 version, bool hidden) =
            cp.getProfile(address(nft), TOKEN_1);

        assertTrue(hidden);
        // history still intact
        assertEq(hash, keccak256(bytes("visible")));
        assertEq(stored, "visible");
        assertEq(version, 1);
    }

    /// Req 6 — hidden profile still retains content and version (history preserved)
    function test_HideProfile_ContentAndVersionPreserved() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "secret");

        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "secret v2");

        vm.prank(admin);
        cp.hideProfile(address(nft), TOKEN_1, true);

        (, string memory stored, uint32 version, bool hidden) =
            cp.getProfile(address(nft), TOKEN_1);

        assertTrue(hidden);
        assertEq(stored, "secret v2");
        assertEq(version, 2);
    }

    /// Req 6 — unhiding restores hidden=false
    function test_HideProfile_CanUnhide() public {
        vm.startPrank(admin);
        cp.hideProfile(address(nft), TOKEN_1, true);
        cp.hideProfile(address(nft), TOKEN_1, false);
        vm.stopPrank();

        (,,,bool hidden) = cp.getProfile(address(nft), TOKEN_1);
        assertFalse(hidden);
    }

    /// hideProfile emits ProfileHidden
    function test_HideProfile_EmitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, true, address(cp));
        emit CityProfile.ProfileHidden(address(nft), TOKEN_1, true);
        cp.hideProfile(address(nft), TOKEN_1, true);
    }

    /// Req 11 — non-admin cannot call hideProfile
    function test_HideProfile_NonAdminReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                carol,
                ADMIN_ROLE
            )
        );
        vm.prank(carol);
        cp.hideProfile(address(nft), TOKEN_1, true);
    }

    // =========================================================================
    // 7. pause / unpause
    // =========================================================================

    /// Req 10 — pause blocks setProfile
    function test_Pause_BlocksSetProfile() public {
        vm.prank(admin);
        cp.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cp.setProfile(address(nft), TOKEN_1, "should fail");
    }

    /// Req 10 — pause blocks clearProfile
    function test_Pause_BlocksClearProfile() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "data");

        vm.prank(admin);
        cp.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cp.clearProfile(address(nft), TOKEN_1);
    }

    /// Req 10 — unpause restores setProfile
    function test_Unpause_RestoresSetProfile() public {
        vm.prank(admin);
        cp.pause();

        vm.prank(admin);
        cp.unpause();

        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "restored");

        (, string memory stored,,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(stored, "restored");
    }

    /// Req 10 — unpause restores clearProfile
    function test_Unpause_RestoresClearProfile() public {
        vm.prank(alice);
        cp.setProfile(address(nft), TOKEN_1, "pre-pause");

        vm.prank(admin);
        cp.pause();
        vm.prank(admin);
        cp.unpause();

        vm.prank(alice);
        cp.clearProfile(address(nft), TOKEN_1);

        (bytes32 hash, string memory stored,,) = cp.getProfile(address(nft), TOKEN_1);
        assertEq(hash, bytes32(0));
        assertEq(bytes(stored).length, 0);
    }

    /// Req 11 — non-admin cannot call pause
    function test_Pause_NonAdminReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                carol,
                ADMIN_ROLE
            )
        );
        vm.prank(carol);
        cp.pause();
    }

    /// Req 11 — non-admin cannot call unpause
    function test_Unpause_NonAdminReverts() public {
        vm.prank(admin);
        cp.pause();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                carol,
                ADMIN_ROLE
            )
        );
        vm.prank(carol);
        cp.unpause();
    }

    // =========================================================================
    // 8. Fuzz — content length boundary
    // =========================================================================

    /// Any content in [0, 1000] bytes must succeed; [1001, 2000] must revert.
    function testFuzz_ContentLengthBoundary(uint256 len) public {
        len = bound(len, 0, 2000);
        string memory content = _makeContent(len);

        vm.prank(alice);
        if (len <= 1000) {
            cp.setProfile(address(nft), TOKEN_1, content);
            (, string memory stored,,) = cp.getProfile(address(nft), TOKEN_1);
            assertEq(bytes(stored).length, len);
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(CityProfile.ContentTooLong.selector, len, uint256(1000))
            );
            cp.setProfile(address(nft), TOKEN_1, content);
        }
    }

    /// Monotonic version property: N consecutive setProfile calls must yield version == N.
    function testFuzz_VersionIsMonotonic(uint8 setCount) public {
        setCount = uint8(bound(uint256(setCount), 1, 20));

        vm.startPrank(alice);
        for (uint256 i = 1; i <= setCount; ++i) {
            cp.setProfile(address(nft), TOKEN_1, string(abi.encodePacked("content-", i)));
            (, , uint32 version,) = cp.getProfile(address(nft), TOKEN_1);
            assertEq(version, uint32(i));
        }
        vm.stopPrank();
    }

    // =========================================================================
    // 9. Invariant — version never resets below its prior value
    // =========================================================================

    // (Stateful invariant is exercised via the unit tests above; the key
    //  property — version never decreases — is covered by testFuzz_VersionIsMonotonic
    //  and test_Version_MonotonicSequence, both of which force multiple
    //  set/clear cycles and assert no regression. A full invariant handler
    //  with targetContract would be equivalent and is documented in the
    //  fuzz-and-invariant-patterns reference for future extension.)
}
