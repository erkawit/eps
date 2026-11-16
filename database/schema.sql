-- =====================================================================
--  ระบบพิมพ์ซองจดหมาย + ระบบพิมพ์เช็ค — โครงสร้างฐานข้อมูล MySQL / MariaDB (XAMPP)
--  ติดตั้งอัตโนมัติจากหน้า "ตั้งค่าการเชื่อมต่อฐานข้อมูล" ของระบบ
--  (หรือ Import ไฟล์นี้ใน phpMyAdmin แล้วตามด้วย seed_*.sql)
--  รันซ้ำได้ — ใช้ CREATE TABLE IF NOT EXISTS / INSERT IGNORE
--  เวลาทุกคอลัมน์ DATETIME เก็บเป็นเวลา UTC (ระบบแปลงเป็นเวลาไทยเอง)
-- =====================================================================
SET NAMES utf8mb4;

-- ---------- 1) ค่าหน่วยงาน (tblSetup) — มีแถวเดียว ----------
CREATE TABLE IF NOT EXISTS settings (
  id                INT NOT NULL DEFAULT 1 PRIMARY KEY,
  org_name          VARCHAR(255) NOT NULL DEFAULT 'ศาลจังหวัดอุดรธานี',
  address           VARCHAR(500) DEFAULT 'ถนนอธิบดี ตำบลหมากแข้ง',
  amphur            VARCHAR(255) DEFAULT 'เมือง',
  province          VARCHAR(255) DEFAULT 'อุดรธานี',
  postcode          VARCHAR(10)  DEFAULT '41000',
  telephone         VARCHAR(100) DEFAULT '0 4222 1993-6',
  fax               VARCHAR(100) DEFAULT '0 4224 3839',
  customer_prefix   VARCHAR(20)  DEFAULT 'CUS',
  customer_year     TINYINT(1)   DEFAULT 1,
  customer_length   INT          DEFAULT 6,
  postage_text      TEXT,
  show_postage      TINYINT(1)   DEFAULT 1,
  emblem_url        MEDIUMTEXT,
  show_emblem       TINYINT(1)   DEFAULT 1,
  white_offset_x    DECIMAL(8,2) DEFAULT 0,
  white_offset_y    DECIMAL(8,2) DEFAULT 0,
  brown_offset_x    DECIMAL(8,2) DEFAULT 0,
  brown_offset_y    DECIMAL(8,2) DEFAULT 0,
  brown_orientation VARCHAR(20)  DEFAULT 'landscape',
  recipient_prefix  VARCHAR(50)  DEFAULT 'เรียน',
  updated_at        DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 2) ข้อมูลหลัก ----------
CREATE TABLE IF NOT EXISTS titles (
  id   INT NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provinces (
  id   INT NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS postcodes (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  postcode   VARCHAR(10)  NOT NULL,
  tumbon     VARCHAR(255) NOT NULL,
  amphur     VARCHAR(255) NOT NULL,
  province   VARCHAR(255) NOT NULL,
  note       TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY postcodes_postcode_idx (postcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) NULL,
  title_id    INT NULL,
  name        VARCHAR(500) NOT NULL,
  address     VARCHAR(1000),
  amphur      VARCHAR(255),
  province_id INT NULL,
  postcode    VARCHAR(10),
  telephone   VARCHAR(100),
  fax         VARCHAR(100),
  contact     VARCHAR(255),
  email       VARCHAR(255),
  note        TEXT,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY customers_code_uq (code),
  KEY customers_name_idx (name(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 3) ทะเบียนหนังสือส่ง / เลขที่หนังสือ ----------
CREATE TABLE IF NOT EXISTS books (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  prefix     VARCHAR(100) NOT NULL,
  year       INT NOT NULL,
  next_no    INT NOT NULL DEFAULT 1,
  auto_reset TINYINT(1) NOT NULL DEFAULT 1,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS letters (
  id                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  book_id            INT NOT NULL,
  year               INT NOT NULL,
  doc_no             INT NOT NULL,
  doc_number         VARCHAR(150) NOT NULL,
  customer_id        BIGINT NULL,
  recipient_name     VARCHAR(500) NOT NULL,
  recipient_address  VARCHAR(1000),
  recipient_amphur   VARCHAR(255),
  recipient_province VARCHAR(255),
  recipient_postcode VARCHAR(10),
  subject            VARCHAR(1000),
  urgency            VARCHAR(20) NOT NULL DEFAULT 'ปกติ',
  envelope           VARCHAR(10) NOT NULL DEFAULT 'white',
  status             VARCHAR(20) NOT NULL DEFAULT 'issued',
  print_count        INT NOT NULL DEFAULT 0,
  printed_at         DATETIME(3) NULL,
  cancel_reason      VARCHAR(1000),
  created_by         CHAR(36) NULL,
  created_by_name    VARCHAR(255),
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY letters_no_uq (book_id, year, doc_no),
  KEY letters_created_idx (created_at),
  CONSTRAINT letters_book_fk FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT letters_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_logs (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  letter_id       BIGINT NOT NULL,
  envelope        VARCHAR(10) NOT NULL,
  printed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  printed_by      CHAR(36) NULL,
  printed_by_name VARCHAR(255),
  KEY print_logs_at_idx (printed_at),
  CONSTRAINT print_logs_letter_fk FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_logs (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  backup_type     VARCHAR(10) NOT NULL,
  path            VARCHAR(500) NOT NULL,
  size_bytes      BIGINT,
  row_counts      LONGTEXT,
  created_by      CHAR(36) NULL,
  created_by_name VARCHAR(255),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY backup_logs_at_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 4) ผู้ใช้งาน (บัญชีเข้าระบบ + สิทธิ์) ----------
CREATE TABLE IF NOT EXISTS app_users (
  id                 CHAR(36) NOT NULL PRIMARY KEY,
  email              VARCHAR(255) NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  email_confirmed_at DATETIME(3) NULL,
  last_sign_in_at    DATETIME(3) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY app_users_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  email         VARCHAR(255),
  full_name     VARCHAR(255),
  role          VARCHAR(10) NOT NULL DEFAULT 'staff',
  active        TINYINT(1) NOT NULL DEFAULT 0,
  perm_envelope TINYINT(1) NOT NULL DEFAULT 1,
  perm_cheque   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แบบตำแหน่งซองของแต่ละผู้ใช้ (บันทึกทุกครั้ง = ประวัติ)
CREATE TABLE IF NOT EXISTS envelope_layouts (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          CHAR(36) NOT NULL,
  user_name        VARCHAR(255),
  envelope         VARCHAR(10) NOT NULL,
  layout           LONGTEXT NOT NULL,
  note             VARCHAR(500),
  source_layout_id BIGINT NULL,
  source_user_name VARCHAR(255),
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY envelope_layouts_user_idx (user_id, envelope, created_at),
  CONSTRAINT envelope_layouts_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 5) ระบบพิมพ์เช็ค ----------
CREATE TABLE IF NOT EXISTS cheque_banks (
  id         INT NOT NULL PRIMARY KEY,
  code       VARCHAR(20) NOT NULL,
  name       VARCHAR(255) NOT NULL,
  short_name VARCHAR(100),
  active     TINYINT(1) NOT NULL DEFAULT 1,
  bg_image   MEDIUMTEXT NULL,          -- ภาพเช็คเปล่า (data URL) ที่ผู้ดูแลอัปโหลดแทนภาพที่มากับระบบ
  UNIQUE KEY cheque_banks_code_uq (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cheque_accounts (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(50) NOT NULL,
  name       VARCHAR(255) NOT NULL,
  bank_id    INT NULL,
  account_no VARCHAR(50),
  note       VARCHAR(500),
  sort       INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY cheque_accounts_code_uq (code),
  CONSTRAINT cheque_accounts_bank_fk FOREIGN KEY (bank_id) REFERENCES cheque_banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cheques (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id      INT NOT NULL,
  bank_id         INT NULL,
  book_no         VARCHAR(50),
  cheque_no       VARCHAR(50) NOT NULL,
  cheque_date     DATE NOT NULL,
  payee           VARCHAR(500) NOT NULL DEFAULT '',
  amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  detail          VARCHAR(1000),
  crossing        VARCHAR(10) NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'normal',
  cancel_date     DATE NULL,
  cancel_amount   DECIMAL(14,2) NULL,
  cancel_reason   VARCHAR(1000),
  fiscal_year     VARCHAR(10), budget_source VARCHAR(255), activity_code VARCHAR(100), bill_no VARCHAR(100), job_no VARCHAR(100), budget_total DECIMAL(14,2) NULL,
  print_count     INT NOT NULL DEFAULT 0,
  printed_at      DATETIME(3) NULL,
  extra           LONGTEXT NULL,             -- ช่องกรอกเพิ่มเติมที่กำหนดในแบบฟอร์มเช็ค {"key":{"label":..,"value":..}}
  legacy_source   VARCHAR(100),
  legacy_key      VARCHAR(100) NULL,
  created_by      CHAR(36) NULL,
  created_by_name VARCHAR(255),
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY cheques_legacy_key_uq (legacy_key),
  KEY cheques_date_idx (cheque_date, id),
  KEY cheques_account_idx (account_id, bank_id, cheque_date),
  KEY cheques_no_idx (cheque_no),
  CONSTRAINT cheques_account_fk FOREIGN KEY (account_id) REFERENCES cheque_accounts(id),
  CONSTRAINT cheques_bank_fk FOREIGN KEY (bank_id) REFERENCES cheque_banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แบบฟอร์มเช็คของแต่ละผู้ใช้ — สำเนาเป็นแถวใหม่อิสระ (source_form_id ไม่มี foreign key)
CREATE TABLE IF NOT EXISTS cheque_forms (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          CHAR(36) NOT NULL,
  user_name        VARCHAR(255),
  bank_id          INT NOT NULL,
  crossing         VARCHAR(10) NOT NULL DEFAULT 'both',
  name             VARCHAR(255) NOT NULL,
  layout           LONGTEXT NOT NULL,
  is_default       TINYINT(1) NOT NULL DEFAULT 0,
  source_form_id   BIGINT NULL,
  source_form_name VARCHAR(255),
  source_user_name VARCHAR(255),
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY cheque_forms_user_idx (user_id, bank_id),
  CONSTRAINT cheque_forms_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT cheque_forms_bank_fk FOREIGN KEY (bank_id) REFERENCES cheque_banks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cheque_print_logs (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cheque_id       BIGINT NOT NULL,
  form_id         BIGINT NULL,
  form_name       VARCHAR(255),
  crossing        VARCHAR(10),
  printed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  printed_by      CHAR(36) NULL,
  printed_by_name VARCHAR(255),
  KEY cheque_print_logs_at_idx (printed_at),
  CONSTRAINT cheque_print_logs_cheque_fk FOREIGN KEY (cheque_id) REFERENCES cheques(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ค่าเริ่มต้นที่ระบบต้องมี ----------
INSERT IGNORE INTO cheque_banks (id, code, name, short_name) VALUES
  (1, 'OTHER', 'ธนาคารอื่น ๆ (รหัสเดิม 1)', 'อื่น ๆ'),
  (2, 'KTB',   'ธนาคารกรุงไทย',  'กรุงไทย'),
  (3, 'KBANK', 'ธนาคารกสิกรไทย', 'กสิกรไทย');

INSERT IGNORE INTO cheque_accounts (code, name, bank_id, note, sort) VALUES
  ('katum',  'บัญชีเงินค่าธรรมเนียมศาล',            2, 'นำเข้าจาก paid_outkatum.xls', 1),
  ('kapost', 'บัญชีเงินค่าส่งหมายและค่าประกาศ',      2, 'นำเข้าจาก paid_outkapost.xls', 2),
  ('kapub',  'บัญชีเงินค่าปรับ',                     2, 'นำเข้าจาก paid_outkapub.xls', 3),
  ('else',   'บัญชีเงินนอกงบประมาณ (อื่น ๆ)',        2, 'นำเข้าจาก paid_out_else.xls', 4),
  ('budget', 'บัญชีเงินงบประมาณ',                    2, 'โครงสร้างจาก paid.xls (ยังไม่มีข้อมูล)', 5);
