import { logger } from '../lib/logger';
import {
  isValidLicenseFormat,
  generateMachineFingerprint,
} from './licenseValidator';

export type LicensePlan = 'founder' | 'standard' | 'trial';

interface LicenseData {
  key: string;
  plan: LicensePlan;
  activatedAt: string;
  machineFingerprint: string;
}

interface TrialInfo {
  remaining: number;
  maxGenerations: number;
}

interface TrialData {
  startedAt: string;
  count: number;
  checksum: string;
}

const MAX_TRIAL_GENERATIONS = 3;
const LICENSE_FILE = 'uploads/nexus/license.json';
const SECRET = 'NexusAlphaV1-7A3F9B2C';

function computeChecksum(count: number, fingerprint: string): string {
  const raw = `${count}:${fingerprint}:${SECRET}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function getLicensePath(): string {
  if (typeof window !== 'undefined') return LICENSE_FILE;
  try {
    const path = require('node:path');
    return path.resolve(LICENSE_FILE);
  } catch {
    return LICENSE_FILE;
  }
}

function readLicenseFile(): LicenseData | null {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('nexus_license');
      if (!raw) return null;
      return JSON.parse(raw) as LicenseData;
    }
    const fs = require('node:fs');
    const licensePath = getLicensePath();
    if (!fs.existsSync(licensePath)) return null;
    const raw = fs.readFileSync(licensePath, 'utf-8');
    return JSON.parse(raw) as LicenseData;
  } catch (err) {
    logger.warn('licenseService', 'Failed to read license file', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function writeLicenseFile(data: LicenseData): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_license', JSON.stringify(data));
      return;
    }
    const fs = require('node:fs');
    const path = require('node:path');
    const licensePath = getLicensePath();
    const dir = path.dirname(licensePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('licenseService', 'License saved', { plan: data.plan });
  } catch (err) {
    logger.error('licenseService', 'Failed to write license file', err instanceof Error ? err.message : String(err));
  }
}

function readTrialData(): TrialData | null {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('nexus_trial');
      if (!raw) return null;
      const data = JSON.parse(raw) as TrialData;
      const expectedChecksum = computeChecksum(data.count, generateMachineFingerprint());
      if (data.checksum !== expectedChecksum) {
        logger.warn('licenseService', 'Trial data tampered — resetting');
        return null;
      }
      return data;
    }
    const fs = require('node:fs');
    const trialPath = getLicensePath().replace('license.json', 'trial.json');
    if (!fs.existsSync(trialPath)) return null;
    const raw = fs.readFileSync(trialPath, 'utf-8');
    const data = JSON.parse(raw) as TrialData;
    const expectedChecksum = computeChecksum(data.count, generateMachineFingerprint());
    if (data.checksum !== expectedChecksum) {
      logger.warn('licenseService', 'Trial data tampered — resetting');
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeTrialData(data: { startedAt: string; count: number }): void {
  try {
    const fingerprint = generateMachineFingerprint();
    const checksum = computeChecksum(data.count, fingerprint);
    const payload: TrialData = { ...data, checksum };

    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_trial', JSON.stringify(payload));
      return;
    }
    const fs = require('node:fs');
    const path = require('node:path');
    const trialPath = getLicensePath().replace('license.json', 'trial.json');
    const dir = path.dirname(trialPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(trialPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    logger.error('licenseService', 'Failed to write trial data', err instanceof Error ? err.message : String(err));
  }
}

export function isLicensed(): boolean {
  const license = readLicenseFile();
  if (!license) return false;

  if (!isValidLicenseFormat(license.key)) {
    logger.warn('licenseService', 'Stored license has invalid format');
    return false;
  }

  logger.info('licenseService', 'License valid', { plan: license.plan });
  return true;
}

export function validateLicense(key: string): { valid: boolean; plan: LicensePlan } {
  const trimmed = key.trim().toUpperCase();

  if (!isValidLicenseFormat(trimmed)) {
    logger.warn('licenseService', 'Invalid license format', { key: trimmed.slice(0, 10) + '...' });
    return { valid: false, plan: 'trial' };
  }

  if (trimmed.startsWith('NEXUS-FOUNDER-')) {
    return { valid: true, plan: 'founder' };
  }

  if (trimmed.startsWith('NEXUS-STANDARD-')) {
    return { valid: true, plan: 'standard' };
  }

  return { valid: true, plan: 'standard' };
}

export function saveLicense(key: string): void {
  const { valid, plan } = validateLicense(key);
  if (!valid) {
    logger.error('licenseService', 'Attempted to save invalid license');
    return;
  }

  const fingerprint = generateMachineFingerprint();
  const licenseData: LicenseData = {
    key: key.trim().toUpperCase(),
    plan,
    activatedAt: new Date().toISOString(),
    machineFingerprint: fingerprint,
  };

  writeLicenseFile(licenseData);
  logger.info('licenseService', 'License activated', { plan, fingerprint });
}

export function getTrialInfo(): TrialInfo {
  const trial = readTrialData();
  if (!trial) {
    const fresh = { startedAt: new Date().toISOString(), count: 0 };
    writeTrialData(fresh);
    return { remaining: MAX_TRIAL_GENERATIONS, maxGenerations: MAX_TRIAL_GENERATIONS };
  }

  const remaining = Math.max(0, MAX_TRIAL_GENERATIONS - trial.count);
  return { remaining, maxGenerations: MAX_TRIAL_GENERATIONS };
}

export function trackGeneration(): void {
  const trial = readTrialData();
  if (!trial) {
    writeTrialData({ startedAt: new Date().toISOString(), count: 1 });
    logger.info('licenseService', 'Trial generation tracked', { count: 1 });
    return;
  }

  trial.count += 1;
  writeTrialData(trial);
  logger.info('licenseService', 'Generation tracked', { count: trial.count, remaining: Math.max(0, MAX_TRIAL_GENERATIONS - trial.count) });
}

export function canGenerate(): boolean {
  if (isLicensed()) return true;

  const trial = readTrialData();
  if (!trial) return true;

  return trial.count < MAX_TRIAL_GENERATIONS;
}
