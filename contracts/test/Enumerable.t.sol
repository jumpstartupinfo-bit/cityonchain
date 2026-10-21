// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ERC721Enumerable integration tests for CityRegistry and DistrictRegistry.
 * Verifies tokenOfOwnerByIndex, totalSupply, tokenByIndex after mint and transfer.
 */
import {Test}             from "forge-std/Test.sol";
import {CityRegistry}     from "../CityOnChain.sol";
import {DistrictRegistry} from "../DistrictRegistry.sol";
import {MerkleProof}      from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// ─── Minimal MockUSDC ─────────────────────────────────────────────────────────
contract ERC20Mock {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

// ─── Minimal Treasury ─────────────────────────────────────────────────────────
contract SimpleTreasury {
    ERC20Mock usdc;
    constructor(address _usdc) { usdc = ERC20Mock(_usdc); }

    function deposit(uint8, uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
    }
}

// ─── CityRegistry Enumerable tests ───────────────────────────────────────────
contract CityEnumerableTest is Test {
    CityRegistry   city;
    ERC20Mock      usdc;
    SimpleTreasury treasury;

    address owner = address(0x1);
    address alice = address(0x2);
    address bob   = address(0x3);

    // Single-leaf Merkle tree for city id=1
    uint256 constant CITY_ID   = 1;
    string  constant NAME      = "TestCity";
    string  constant COUNTRY   = "TC";
    uint256 constant POPULATION = 100_000;
    uint8   constant TIER      = 6;

    bytes32 merkleRoot;
    bytes32[] proof; // empty proof for single-leaf tree

    function setUp() public {
        usdc     = new ERC20Mock();
        treasury = new SimpleTreasury(address(usdc));
        city     = new CityRegistry(address(usdc), address(treasury), owner);

        // Build single-leaf tree
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(CITY_ID, NAME, COUNTRY, POPULATION, TIER))));
        merkleRoot = leaf; // single-node tree: root = leaf

        vm.startPrank(owner);
        city.setMerkleRoot(merkleRoot);
        city.setTreasuryContract(address(treasury));
        vm.stopPrank();

        // Fund alice
        usdc.mint(alice, 1_000_000_000);
        vm.prank(alice); usdc.approve(address(city), type(uint256).max);

        // Pre-register treasury as depositor on SimpleTreasury (no check here — SimpleTreasury always accepts)
    }

    function test_Enumerable_TotalSupply_StartsZero() public view {
        assertEq(city.totalSupply(), 0);
    }

    function test_Enumerable_TotalSupply_AfterMint() public {
        _mintCity(alice);
        assertEq(city.totalSupply(), 1);
    }

    function test_Enumerable_BalanceOf_AfterMint() public {
        _mintCity(alice);
        assertEq(city.balanceOf(alice), 1);
    }

    function test_Enumerable_TokenOfOwnerByIndex_AfterMint() public {
        _mintCity(alice);
        assertEq(city.tokenOfOwnerByIndex(alice, 0), CITY_ID);
    }

    function test_Enumerable_TokenByIndex_AfterMint() public {
        _mintCity(alice);
        assertEq(city.tokenByIndex(0), CITY_ID);
    }

    function test_Enumerable_TokenOfOwnerByIndex_AfterTransfer() public {
        _mintCity(alice);
        vm.prank(alice);
        city.transferFrom(alice, bob, CITY_ID);

        // alice has no tokens
        assertEq(city.balanceOf(alice), 0);
        // bob has the token
        assertEq(city.balanceOf(bob), 1);
        assertEq(city.tokenOfOwnerByIndex(bob, 0), CITY_ID);
    }

    function test_Enumerable_OOB_Reverts() public {
        _mintCity(alice);
        vm.expectRevert();
        city.tokenOfOwnerByIndex(alice, 1);
    }

    function _mintCity(address buyer) internal {
        vm.prank(buyer);
        city.claimCity(CITY_ID, NAME, COUNTRY, POPULATION, TIER, proof);
    }
}

// ─── DistrictRegistry Enumerable tests ───────────────────────────────────────
contract DistrictEnumerableTest is Test {
    DistrictRegistry registry;
    ERC20Mock        usdc;
    SimpleTreasury   treasury;

    address owner     = address(0x1);
    address cityOwner = address(0x2);
    address alice     = address(0x3);

    uint256 constant CITY_ID    = 1;
    uint8   constant TIER       = 6;      // 4 districts
    // No CITY_PRICE — price is now derived on-chain from _cityPriceForTier(6)=40_000_000
    // 40_000_000 * 500/10000 = 2_000_000 < PRICE_FLOOR(5_000_000) → buyer pays 5_000_000

    // Stub CityRegistry that returns cityOwner for any tokenId and TIER for getCityTier
    MockCityReg cityReg;

    function setUp() public {
        usdc     = new ERC20Mock();
        treasury = new SimpleTreasury(address(usdc));
        cityReg  = new MockCityReg(cityOwner, TIER);

        registry = new DistrictRegistry(address(usdc), address(cityReg), address(treasury), owner);

        // Open districts as cityOwner (sets mintedAt=1, no first-refusal window)
        vm.prank(cityOwner);
        registry.openDistricts(CITY_ID);

        usdc.mint(alice, 1_000_000_000);
        vm.prank(alice); usdc.approve(address(registry), type(uint256).max);
    }

    function test_D_Enumerable_TotalSupply_StartsZero() public view {
        assertEq(registry.totalSupply(), 0);
    }

    function test_D_Enumerable_TotalSupply_AfterBuy() public {
        _buyDistrict(alice, 0);
        assertEq(registry.totalSupply(), 1);
    }

    function test_D_Enumerable_TokenOfOwnerByIndex_AfterBuy() public {
        _buyDistrict(alice, 0);
        uint256 expectedId = registry.tokenIdFor(CITY_ID, 0);
        assertEq(registry.tokenOfOwnerByIndex(alice, 0), expectedId);
    }

    function test_D_Enumerable_MultipleDistricts() public {
        _buyDistrict(alice, 0);
        _buyDistrict(alice, 1);
        assertEq(registry.balanceOf(alice), 2);
        // Both tokens accessible by index
        uint256 t0 = registry.tokenOfOwnerByIndex(alice, 0);
        uint256 t1 = registry.tokenOfOwnerByIndex(alice, 1);
        assertTrue(t0 != t1);
    }

    function test_D_Enumerable_TokenByIndex_Global() public {
        _buyDistrict(alice, 0);
        _buyDistrict(alice, 1);
        assertEq(registry.totalSupply(), 2);
        // tokenByIndex(0) and (1) return the two purchased tokens
        assertTrue(registry.tokenByIndex(0) != registry.tokenByIndex(1));
    }

    function _buyDistrict(address buyer, uint8 districtIndex) internal {
        vm.prank(buyer);
        registry.buyDistrict(CITY_ID, districtIndex);
    }
}

// ─── Stub CityRegistry ────────────────────────────────────────────────────────
contract MockCityReg {
    address immutable _owner;
    uint8   immutable _tier;
    constructor(address o, uint8 t) { _owner = o; _tier = t; }
    function ownerOf(uint256) external view returns (address) { return _owner; }
    function getCityTier(uint256) external view returns (uint8) { return _tier; }
}
