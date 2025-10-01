function sanitizeNotification(doc) {
  if (!doc) return null;
  const obj = (typeof doc.toObject === 'function') ? doc.toObject() : Object.assign({}, doc);
  const sanitizeValue = (v, depth = 0) => {
    if (depth > 3) return undefined;
    if (v === null || v === undefined) return v;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    try {
      if (v && typeof v === 'object' && (v._bsontype === 'ObjectID' || v._bsontype === 'ObjectId')) {
        return String(v);
      }
    } catch (e) {}
    if (v && typeof v === 'object' && v.toString && /^\s*[0-9a-fA-F]{24}\s*$/.test(String(v))) {
      return String(v);
    }
    if (Array.isArray(v)) return v.map((el) => sanitizeValue(el, depth + 1)).filter((x) => x !== undefined);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) {
        try {
          const sv = sanitizeValue(v[k], depth + 1);
          if (sv !== undefined) out[k] = sv;
        } catch (e) {
        }
      }
      return out;
    }
    return undefined;
  };

  const safe = {
    _id: obj._id ? String(obj._id) : obj._id,
    recipient: obj.recipient ? String(obj.recipient) : obj.recipient,
    type: obj.type,
    message: obj.message,
    read: !!obj.read,
    createdAt: obj.createdAt
  };
  if (obj.priority) safe.priority = obj.priority;
  if (obj.channels && Array.isArray(obj.channels)) safe.channels = obj.channels.map(String);
  if (obj.status) safe.status = obj.status;
  if (obj.ttl) safe.ttl = obj.ttl;
  if (obj.relatedId) {
    try {
      safe.relatedId = String(obj.relatedId);
    } catch (e) {
      safe.relatedId = obj.relatedId;
    }
  } else if (obj.meta && obj.meta.originalRelatedId) {
    safe.relatedId = obj.meta.originalRelatedId;
  }

  if (safe.relatedId) safe.related = safe.relatedId;
  else if (obj.related) safe.related = sanitizeValue(obj.related);

  if (obj.orderId) safe.orderId = sanitizeValue(obj.orderId);
  else if (obj.orderData && obj.orderData.orderId) safe.orderId = sanitizeValue(obj.orderData.orderId);

  if (obj.orderData) {
    safe.data = { order: sanitizeValue(obj.orderData) };
  } else if (obj.data) {
    safe.data = sanitizeValue(obj.data);
  }

  if (obj.meta && typeof obj.meta === 'object') {
    const allowedMeta = {};
    if (obj.meta.originalRelatedId) allowedMeta.originalRelatedId = obj.meta.originalRelatedId;
    for (const k of Object.keys(obj.meta)) {
      const val = obj.meta[k];
      if (k === 'originalRelatedId') continue;
      if (val === null || val === undefined) continue;
      if (['string', 'number', 'boolean'].includes(typeof val)) allowedMeta[k] = val;
    }
    if (Object.keys(allowedMeta).length) safe.meta = allowedMeta;
  }
  return safe;
}

module.exports = { sanitizeNotification };
