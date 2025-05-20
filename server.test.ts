import request, { Response } from 'supertest';
import express from 'express';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { EndpointId } from '@layerzerolabs/lz-definitions';
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat';
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities';
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools';
import app from './server';

// Mock the child_process spawn
jest.mock('child_process', () => ({
    spawn: jest.fn()
}));

// Mock fs operations
jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    readFileSync: jest.fn()
}));

describe('Token Creation Server', () => {
    const validTokenRequest = {
        mintName: 'TestOFT',
        mintSymbol: 'TOFT',
        totalTokens: '1000000',
        mintUri: 'https://example.com/token',
        destinationChains: ['arbitrum-sepolia', 'bsc-v2-testnet']
    };

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        
        // Mock successful command execution
        (spawn as jest.Mock).mockImplementation(() => ({
            on: (event: string, callback: Function) => {
                if (event === 'close') {
                    callback(0); // Success exit code
                }
                return this;
            }
        }));

        // Mock file operations
        (readFileSync as jest.Mock).mockReturnValue('mock config content');
        (writeFileSync as jest.Mock).mockImplementation(() => {});
    });

    describe('POST /api/create-token', () => {
        it('should successfully create a token with all steps completed', async () => {
            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                message: 'Token created successfully with cross-chain support',
                progress: {
                    step1Completed: true,
                    step2Completed: {
                        'arbitrum-sepolia': true,
                        'bsc-v2-testnet': true
                    },
                    step3Completed: true,
                    step4Completed: true
                }
            });
        });

        it('should handle Solana OFT creation failure', async () => {
            // Mock Solana OFT creation failure
            (spawn as jest.Mock).mockImplementationOnce(() => ({
                on: (event: string, callback: Function) => {
                    if (event === 'close') {
                        callback(1); // Error exit code
                    }
                    return this;
                }
            }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to create Solana OFT');
            expect(response.body.progress.step1Completed).toBe(false);
        });

        it('should handle EVM chain deployment failure', async () => {
            // Mock successful Solana creation but failed EVM deployment
            (spawn as jest.Mock)
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(1);
                        }
                        return this;
                    }
                }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Failed to deploy OFT on');
            expect(response.body.progress.step1Completed).toBe(true);
            expect(response.body.progress.step2Completed).toEqual({});
        });

        it('should handle configuration update failure', async () => {
            // Mock successful steps 1 and 2 but failed step 3
            (spawn as jest.Mock)
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(1);
                        }
                        return this;
                    }
                }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to update and initialize config');
            expect(response.body.progress.step3Completed).toBe(false);
        });

        it('should handle configuration wiring failure', async () => {
            // Mock successful steps 1-3 but failed step 4
            (spawn as jest.Mock)
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(1);
                        }
                        return this;
                    }
                }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Failed to wire configurations');
            expect(response.body.progress.step4Completed).toBe(false);
        });

        it('should validate required fields', async () => {
            const invalidRequest = {
                mintName: 'TestOFT',
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/create-token')
                .send(invalidRequest);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        it('should validate supported chains', async () => {
            const requestWithInvalidChain = {
                ...validTokenRequest,
                destinationChains: ['unsupported-chain']
            };

            const response = await request(app)
                .post('/api/create-token')
                .send(requestWithInvalidChain);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Unsupported chain');
        });

        it('should handle retries for transaction expiration', async () => {
            // Mock transaction expiration error followed by success
            (spawn as jest.Mock)
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(1);
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0);
                        }
                        return this;
                    }
                }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/supported-chains', () => {
        it('should return list of supported chains', async () => {
            const response = await request(app)
                .get('/api/supported-chains');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('arbitrum-sepolia');
            expect(response.body).toHaveProperty('bsc-v2-testnet');
            expect(response.body['arbitrum-sepolia']).toHaveProperty('eid', EndpointId.ARBSEP_V2_TESTNET);
            expect(response.body['bsc-v2-testnet']).toHaveProperty('eid', EndpointId.BSC_V2_TESTNET);
        });
    });

    describe('Token Creation Progress', () => {
        it('should track progress state transitions correctly', async () => {
            const progress = {
                step1Completed: false,
                step2Completed: {},
                step3Completed: false,
                step4Completed: false
            };

            // Mock step 1 success
            (spawn as jest.Mock).mockImplementationOnce(() => ({
                on: (event: string, callback: Function) => {
                    if (event === 'close') {
                        callback(0);
                    }
                    return this;
                }
            }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.body.progress.step1Completed).toBe(true);
            expect(response.body.progress.step2Completed).toEqual({});
            expect(response.body.progress.step3Completed).toBe(false);
            expect(response.body.progress.step4Completed).toBe(false);
        });

        it('should handle partial EVM chain deployment success', async () => {
            // Mock successful deployment for arbitrum-sepolia but failure for bsc-v2-testnet
            (spawn as jest.Mock)
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0); // Solana success
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(0); // Arbitrum success
                        }
                        return this;
                    }
                }))
                .mockImplementationOnce(() => ({
                    on: (event: string, callback: Function) => {
                        if (event === 'close') {
                            callback(1); // BSC failure
                        }
                        return this;
                    }
                }));

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.progress.step1Completed).toBe(true);
            expect(response.body.progress.step2Completed).toEqual({
                'arbitrum-sepolia': true
            });
            expect(response.body.error).toContain('Failed to deploy OFT on bsc-v2-testnet');
        });
    });

    describe('Concurrent Token Creation', () => {
        it('should handle multiple concurrent token creation requests', async () => {
            const requests = [
                {
                    mintName: 'TestOFT1',
                    mintSymbol: 'TOFT1',
                    totalTokens: '1000000',
                    mintUri: 'https://example.com/token1',
                    destinationChains: ['arbitrum-sepolia']
                },
                {
                    mintName: 'TestOFT2',
                    mintSymbol: 'TOFT2',
                    totalTokens: '2000000',
                    mintUri: 'https://example.com/token2',
                    destinationChains: ['arbitrum-sepolia']
                }
            ];

            // Mock successful execution for both requests
            (spawn as jest.Mock).mockImplementation(() => ({
                on: (event: string, callback: Function) => {
                    if (event === 'close') {
                        callback(0);
                    }
                    return this;
                }
            }));

            const responses = await Promise.all(
                requests.map(req => 
                    request(app)
                        .post('/api/create-token')
                        .send(req)
                )
            );

            responses.forEach((response: Response) => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });
        });
    });

    describe('Configuration Handling', () => {
        it('should handle corrupted configuration file', async () => {
            // Mock corrupted config file
            (readFileSync as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Invalid JSON');
            });

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Failed to read configuration');
        });

        it('should handle missing configuration file', async () => {
            // Mock missing config file
            (readFileSync as jest.Mock).mockImplementationOnce(() => {
                throw new Error('ENOENT');
            });

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Configuration file not found');
        });

        it('should handle invalid configuration format', async () => {
            // Mock invalid config format
            (readFileSync as jest.Mock).mockReturnValueOnce('invalid-json-content');

            const response = await request(app)
                .post('/api/create-token')
                .send(validTokenRequest);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Invalid configuration format');
        });
    });
}); 