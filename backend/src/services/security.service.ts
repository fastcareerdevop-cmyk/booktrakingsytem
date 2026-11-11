import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { SecuritySetting } from '../models';
import { logAudit } from '../utils/audit';

const PIN_KEY = 'ADMIN_SECURITY_PIN';

export async function getPinStatus() {
  const setting = await SecuritySetting.findOne({ key: PIN_KEY });
  return {
    isConfigured: !!setting && !!setting.isConfigured,
    updatedAt: setting?.updatedAt || null,
    updatedByUserName: setting?.updatedByUserName || null,
  };
}

export async function setSecurityPin(pin: string, adminUser: { id: string; name: string }) {
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw {
      statusCode: 400,
      message: 'Security PIN must be exactly 4 numeric digits (0000 - 9999).',
      code: 'INVALID_PIN_FORMAT',
    };
  }

  const pinHash = await bcrypt.hash(cleanPin, 10);

  const updated = await SecuritySetting.findOneAndUpdate(
    { key: PIN_KEY },
    {
      pinHash,
      isConfigured: true,
      updatedByUserId: new mongoose.Types.ObjectId(adminUser.id),
      updatedByUserName: adminUser.name,
    },
    { upsert: true, new: true }
  );

  await logAudit({
    actorUserId: adminUser.id,
    action: 'SECURITY_PIN_UPDATED',
    entityType: 'SecuritySetting',
    entityId: updated._id.toString(),
    metadata: { updatedBy: adminUser.name },
  });

  return {
    message: '4-digit Security PIN configured successfully.',
    updatedAt: updated.updatedAt,
  };
}

export async function verifySecurityPin(pin: string) {
  const cleanPin = String(pin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw {
      statusCode: 400,
      message: 'Please enter a valid 4-digit Security PIN.',
      code: 'INVALID_PIN_FORMAT',
    };
  }

  const setting = await SecuritySetting.findOne({ key: PIN_KEY });
  if (!setting || !setting.isConfigured || !setting.pinHash) {
    throw {
      statusCode: 400,
      message: 'Security PIN has not been set yet. Please set a 4-digit PIN in the Admin Security module.',
      code: 'PIN_NOT_CONFIGURED',
    };
  }

  const isMatch = await bcrypt.compare(cleanPin, setting.pinHash);
  if (!isMatch) {
    throw {
      statusCode: 400,
      message: 'Incorrect Security PIN. Authorization rejected.',
      code: 'INCORRECT_SECURITY_PIN',
    };
  }

  return true;
}
