
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

import { getOftStoreAddress } from './tasks/solana'

const solanaContract: OmniPointHardhat = {
    eid: EndpointId.SOLANA_V2_TESTNET,
    address: getOftStoreAddress(EndpointId.SOLANA_V2_TESTNET),
}


const chain0: OmniPointHardhat = {
    eid: 40231,
    contractName: 'MyOFT',
}

const chain1: OmniPointHardhat = {
    eid: 40102,
    contractName: 'MyOFT',
}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        "msgType": 1,
        "optionType": 1,
        "gas": 300000,
        "value": 0
    }
]

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        "msgType": 1,
        "optionType": 1,
        "gas": 200000,
        "value": 2500000
    }
]

export default async function () {
    const connections = await generateConnectionsConfig([
        
        [
            chain0,
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ],

        [
            chain1,
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ],
    ])

    return {
        contracts: [
            { contract: solanaContract },
            { contract: chain0 },
            { contract: chain1 }
        ],
        connections,
    }
}
