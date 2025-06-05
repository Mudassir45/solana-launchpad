import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Runs the LayerZero oapp:wire Hardhat task with a unique temp config file and network.
 * @param configContent The contents of the config file (TypeScript string)
 * @param network The network name to wire (e.g., 'arbitrum-sepolia')
 * @returns The stdout output from the Hardhat task (should be JSON or relevant output)
 */
export async function runWire(configContent: string, network: string): Promise<string> {
  // Create a unique temp file in .tmp directory in project root
  const tmpDir = join(process.cwd(), '.tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tempFile = join(tmpDir, `layerzero-config-${randomUUID()}.ts`);
  try {
    // Write config to temp file
    await fs.writeFile(tempFile, configContent, 'utf-8');

    // Run the Hardhat task with retries
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          const child = spawn('pnpm', [
            'hardhat',
            'lz:oapp:wire',
            '--oapp-config', tempFile,
            '--network', network
          ], { 
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            console.log(chunk); // Log the output
            
            // Auto-respond to prompts
            if (chunk.includes('Would you like to preview the transactions before continuing?') ||
                chunk.includes('Would you like to submit the required transactions?') ||
                chunk.includes('Continue?') ||
                chunk.includes('(Y/n)')) {
              child.stdin.write('yes\n');
            }
          });

          child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
          });

          child.on('close', (code) => {
            // Clean up temp file
            fs.unlink(tempFile).catch(() => {});
            if (code === 0) {
              resolve(stdout.trim());
            } else {
              reject(new Error(`oapp:wire failed: ${stderr || stdout}`));
            }
          });

          child.on('error', (err) => {
            fs.unlink(tempFile).catch(() => {});
            reject(err);
          });
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          console.log(`Wire attempt ${attempt} failed, retrying... (${lastError.message})`);
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Wire failed after all retries');
  } catch (err) {
    // Clean up on error
    await fs.unlink(tempFile).catch(() => {});
    throw err;
  }
} 