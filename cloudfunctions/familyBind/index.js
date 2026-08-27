const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const FAMILY_COL = "family";
const CHILD_COL = "child";
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nowIso() {
  return new Date().toISOString();
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function placeholderFamilyId(openid) {
  return `tmp:${openid}`;
}

function toMember(m) {
  if (!m) return null;
  const out = { openid: m.openid, role: m.role };
  if (m.childId) out.childId = m.childId;
  return out;
}

function toFamily(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    members: (doc.members || []).map(toMember),
    inviteCode: doc.inviteCode || "",
    inviteExpireAt: doc.inviteExpireAt || "",
    inviteChildId: doc.inviteChildId || "",
    createdAt: doc.createdAt || "",
    updatedAt: doc.updatedAt || "",
  };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/already exist|已存在|-501001|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      // 已存在忽略
    }
  }
}

async function findFamilyByOpenid(openid) {
  await ensureCollection(FAMILY_COL);
  const res = await db
    .collection(FAMILY_COL)
    .where({
      members: _.elemMatch({ openid }),
    })
    .limit(1)
    .get();
  return (res.data && res.data[0]) || null;
}

async function findFamilyByInviteCode(code) {
  const res = await db
    .collection(FAMILY_COL)
    .where({ inviteCode: code })
    .limit(1)
    .get();
  return (res.data && res.data[0]) || null;
}

function memberOf(doc, openid) {
  return (doc.members || []).find((m) => m.openid === openid) || null;
}

function randomInviteCode() {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return s;
}

async function uniqueInviteCode() {
  for (let i = 0; i < 8; i++) {
    const code = randomInviteCode();
    const hit = await findFamilyByInviteCode(code);
    if (!hit) return code;
  }
  return fail("invite_code_busy");
}

async function migrateTmpChildren(openid, familyId) {
  await ensureCollection(CHILD_COL);
  const tmp = placeholderFamilyId(openid);
  const now = nowIso();
  try {
    const res = await db.collection(CHILD_COL).where({ familyId: tmp }).limit(100).get();
    const docs = res.data || [];
    for (const doc of docs) {
      await db.collection(CHILD_COL).doc(doc._id).update({
        data: { familyId, updatedAt: now },
      });
    }
    return docs.length;
  } catch (e) {
    console.error("migrateTmpChildren", e);
    return 0;
  }
}

async function createFamily(event, openid) {
  const existing = await findFamilyByOpenid(openid);
  if (existing) return fail("already_in_family", { family: toFamily(existing) });

  const now = nowIso();
  const members = [{ openid, role: "parent" }];
  const addRes = await db.collection(FAMILY_COL).add({
    data: {
      members,
      inviteCode: "",
      inviteExpireAt: "",
      inviteChildId: "",
      createdByOpenid: openid,
      createdAt: now,
      updatedAt: now,
    },
  });

  const familyId = addRes._id;
  const migrated = await migrateTmpChildren(openid, familyId);
  const family = toFamily({
    _id: familyId,
    members,
    inviteCode: "",
    inviteExpireAt: "",
    inviteChildId: "",
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, family, migratedChildCount: migrated };
}

async function createInvite(event, openid) {
  const family = await findFamilyByOpenid(openid);
  if (!family) return fail("family_not_found");
  const me = memberOf(family, openid);
  if (!me || me.role !== "parent") return fail("parent_only");

  const inviteChildId = trimStr(event && event.inviteChildId);
  if (inviteChildId) {
    await ensureCollection(CHILD_COL);
    const got = await db.collection(CHILD_COL).doc(inviteChildId).get();
    const child = got.data;
    if (!child) return fail("child_not_found");
    if (child.familyId !== family._id) return fail("family_mismatch");
  }

  const codeRes = await uniqueInviteCode();
  if (codeRes && codeRes.ok === false) return codeRes;
  const inviteCode = codeRes;
  const now = new Date();
  const inviteExpireAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const nowIsoStr = now.toISOString();

  await db.collection(FAMILY_COL).doc(family._id).update({
    data: {
      inviteCode,
      inviteExpireAt,
      inviteChildId: inviteChildId || "",
      updatedAt: nowIsoStr,
    },
  });

  return {
    ok: true,
    inviteCode,
    inviteExpireAt,
    inviteChildId: inviteChildId || "",
    familyId: family._id,
  };
}

async function joinFamily(event, openid) {
  const existing = await findFamilyByOpenid(openid);
  const inviteCode = trimStr(event && event.inviteCode).toUpperCase();
  if (!inviteCode) return fail("invite_code_required");

  await ensureCollection(FAMILY_COL);
  const family = await findFamilyByInviteCode(inviteCode);
  if (!family) return fail("invite_invalid");
  if (existing && existing._id !== family._id) return fail("already_in_family");
  if (existing && existing._id === family._id) {
    return { ok: true, family: toFamily(existing), alreadyMember: true };
  }

  const exp = family.inviteExpireAt ? Date.parse(family.inviteExpireAt) : 0;
  if (!exp || Date.now() > exp) return fail("invite_expired");

  const inviteChildId = trimStr(family.inviteChildId);
  let role = "parent";
  let childId = "";
  if (inviteChildId) {
    role = "student";
    childId = inviteChildId;
    await ensureCollection(CHILD_COL);
    const got = await db.collection(CHILD_COL).doc(childId).get();
    if (!got.data) return fail("child_not_found");
    if (got.data.familyId !== family._id) return fail("family_mismatch");
  }

  if (role === "student" && !childId) return fail("child_id_required");

  const member = { openid, role };
  if (childId) member.childId = childId;
  const members = (family.members || []).concat([member]);
  const now = nowIso();
  await db.collection(FAMILY_COL).doc(family._id).update({
    data: {
      members,
      inviteCode: "",
      inviteExpireAt: "",
      inviteChildId: "",
      updatedAt: now,
    },
  });

  return {
    ok: true,
    family: toFamily({
      ...family,
      members,
      inviteCode: "",
      inviteExpireAt: "",
      inviteChildId: "",
      updatedAt: now,
    }),
  };
}

async function me(_event, openid) {
  const family = await findFamilyByOpenid(openid);
  if (!family) {
    return { ok: true, family: null, role: "", member: null };
  }
  const member = toMember(memberOf(family, openid));
  return {
    ok: true,
    family: toFamily(family),
    role: member ? member.role : "",
    member,
  };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail("openid_missing");

  const action = trimStr(e.action) || "me";
  try {
    if (action === "createFamily") return await createFamily(e, OPENID);
    if (action === "createInvite") return await createInvite(e, OPENID);
    if (action === "joinFamily") return await joinFamily(e, OPENID);
    if (action === "me") return await me(e, OPENID);
    return fail("unknown_action");
  } catch (err) {
    console.error("familyBind", err);
    return fail("internal_error");
  }
};
