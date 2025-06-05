import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Runs the LayerZero init-config Hardhat task with a unique temp config file.
 * @param configContent The contents of the config file (TypeScript string)
 * @returns The stdout output from the Hardhat task (should be JSON)
 */
export async function runInitConfig(configContent: string): Promise<string> {
  // Create a unique temp file in .tmp directory in project root
  const tmpDir = join(process.cwd(), '.tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tempFile = join(tmpDir, `layerzero-config-${randomUUID()}.ts`);
  try {
    // Write config to temp file
    await fs.writeFile(tempFile, configContent, 'utf-8');

    // Run the Hardhat task
    return await new Promise((resolve, reject) => {
      const child = spawn('pnpm', [
        'hardhat',
        'lz:oft:solana:init-config',
        '--oapp-config', tempFile
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
          reject(new Error(`init-config failed: ${stderr || stdout}`));
        }
      });

      child.on('error', (err) => {
        fs.unlink(tempFile).catch(() => {});
        reject(err);
      });
    });
  } catch (err) {
    // Clean up on error
    await fs.unlink(tempFile).catch(() => {});
    throw err;
  }
} 