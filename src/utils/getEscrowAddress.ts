import { Connection, PublicKey } from '@solana/web3.js';
import { OftPDA } from '@layerzerolabs/oft-v2-solana-sdk';
import { publicKey } from '@metaplex-foundation/umi';

// Define valid network types
type Network = 'mainnet' | 'testnet' | 'devnet';

// Network-specific RPC endpoints
const RPC_ENDPOINTS: Record<Network, string> = {
    'mainnet': 'https://api.mainnet-beta.solana.com',
    'testnet': 'https://api.testnet.solana.com',
    'devnet': 'https://api.devnet.solana.com'
};

// Constants for data layout
const DISCRIMINATOR_SIZE = 8;
const OFT_TYPE_SIZE = 1;
const LD2SD_RATE_SIZE = 8;
const PUBKEY_SIZE = 32;
const BUMP_SIZE = 1;
const TVL_LD_SIZE = 8;
const ADMIN_SIZE = 32;
const DEFAULT_FEE_BPS_SIZE = 2;
const PAUSED_SIZE = 1;
const PAUSER_SIZE = 33;
const UNPAUSER_SIZE = 33;

/**
 * Get the escrow address for a given mint address
 * @param connection Solana connection
 * @param programId OFT program ID
 * @param mintAddress Token mint address
 * @returns Promise<PublicKey> The escrow address
 */
export async function getEscrowAddress(
    connection: Connection,
    programId: PublicKey,
    mintAddress: PublicKey
): Promise<PublicKey> {
    // 1. First check if the program exists
    const programInfo = await connection.getAccountInfo(programId);
    if (!programInfo) {
        throw new Error(`Program ${programId.toBase58()} does not exist on this network`);
    }

    // 2. Check if the mint exists
    const mintInfo = await connection.getAccountInfo(mintAddress);
    if (!mintInfo) {
        throw new Error(`Mint ${mintAddress.toBase58()} does not exist on this network`);
    }

    // 3. Get all program accounts
    const allAccounts = await connection.getProgramAccounts(programId, {
        commitment: 'confirmed',
        encoding: 'base64'
    });

    // 4. For each account, check if it's an OFT store
    for (const account of allAccounts) {
        try {
            // Parse the OFT store account data
            const data = account.account.data;
            
            // Calculate offsets based on data layout
            const tokenMintOffset = DISCRIMINATOR_SIZE + OFT_TYPE_SIZE + LD2SD_RATE_SIZE;
            const tokenEscrowOffset = tokenMintOffset + PUBKEY_SIZE;
            
            // Extract token mint and escrow addresses
            const tokenMint = new PublicKey(data.slice(tokenMintOffset, tokenMintOffset + PUBKEY_SIZE));
            const tokenEscrow = new PublicKey(data.slice(tokenEscrowOffset, tokenEscrowOffset + PUBKEY_SIZE));
            
            if (tokenMint.equals(mintAddress)) {
                console.log('Found OFT store:');
                console.log('Token mint:', tokenMint.toBase58());
                console.log('Escrow address:', tokenEscrow.toBase58());
                console.log('Account address:', account.pubkey.toBase58());
                return tokenEscrow;
            }
        } catch (e: any) {
            continue;
        }
    }

    // 5. If we didn't find any accounts, try using OftPDA to derive the address
    const oftDeriver = new OftPDA(publicKey(programId.toBase58()));
    
    // Get all token accounts that hold this mint
    const tokenAccounts = await connection.getTokenLargestAccounts(mintAddress);
    
    for (const tokenAccount of tokenAccounts.value) {
        try {
            const tokenAccountPubkey = new PublicKey(tokenAccount.address);
            const [oftStorePda] = oftDeriver.oftStore(publicKey(tokenAccountPubkey.toBase58()));
            
            // Check if this PDA exists and has the correct mint
            const oftStoreInfo = await connection.getAccountInfo(new PublicKey(oftStorePda.toString()));
            if (oftStoreInfo) {
                const data = oftStoreInfo.data;
                const tokenMintOffset = DISCRIMINATOR_SIZE + OFT_TYPE_SIZE + LD2SD_RATE_SIZE;
                const tokenEscrowOffset = tokenMintOffset + PUBKEY_SIZE;
                
                const storeTokenMint = new PublicKey(data.slice(tokenMintOffset, tokenMintOffset + PUBKEY_SIZE));
                const storeTokenEscrow = new PublicKey(data.slice(tokenEscrowOffset, tokenEscrowOffset + PUBKEY_SIZE));
                
                if (storeTokenMint.equals(mintAddress)) {
                    console.log('Found OFT store using PDA derivation:');
                    console.log('Token mint:', storeTokenMint.toBase58());
                    console.log('Escrow address:', storeTokenEscrow.toBase58());
                    console.log('Account address:', oftStorePda.toString());
                    return storeTokenEscrow;
                }
            }
        } catch (e: any) {
            continue;
        }
    }

    throw new Error(`No OFT store found for mint ${mintAddress.toBase58()}`);
}

// Example usage
async function main() {
    // Get network from command line argument
    const network = (process.argv[2]?.toLowerCase() || 'devnet') as Network;
    if (!RPC_ENDPOINTS[network]) {
        console.error('Invalid network. Please use: mainnet, testnet, or devnet');
        process.exit(1);
    }

    // OFT program ID
    const programId = new PublicKey('HmN84fc4YAhvxF2WnP891XxZb3hoTL1PpjYHyiRXDCc9');
    
    // Example mint address (replace with your mint address)
    const mintAddress = new PublicKey('BFbpdwLr412A79N7CYrLZEB8G2xtyNF1LCV6x12PxbVy');
    
    try {
        console.log(`\nUsing ${network} network`);
        const connection = new Connection(RPC_ENDPOINTS[network], 'confirmed');
        
        const escrowAddress = await getEscrowAddress(connection, programId, mintAddress);
    } catch (error) {
        console.error(`Failed to find OFT store on ${network}:`, error);
        process.exit(1);
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
} 