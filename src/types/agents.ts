/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomAgentData {
  id: string;
  name: string;
  type: 'script' | 'folder' | 'config';
  status: 'active' | 'analyzing' | 'uploading' | 'error';
  analysis?: string;
  lastActive: string;
  fileCount?: number;
}

export interface CLIStateData {
  activeProvider: 'opencode' | 'openrouter' | 'deepseek';
  lastCommand?: string;
  output: string[];
}
