-- =====================================================================
-- 基础数据管理模块 (MDM) 数据库建表脚本 v2
-- Schema: cdop_master
-- 执行方式: 在 MySQL 中直接运行此脚本
-- =====================================================================

USE `cdop_master`;

-- ---------------------------------------------------
-- 品类信息表（三级树）
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_category_info` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `category_code`  VARCHAR(50)   NOT NULL                COMMENT '品类编码',
  `category_name`  VARCHAR(100)  NOT NULL                COMMENT '品类名称',
  `level`          TINYINT       DEFAULT 1               COMMENT '层级：1/2/3',
  `parent_code`    VARCHAR(50)   DEFAULT NULL            COMMENT '父级编码（一级为空）',
  `sort_order`     INT           DEFAULT 0               COMMENT '排序',
  `status`         TINYINT       DEFAULT 1               COMMENT '1有效 0无效',
  `remark`         VARCHAR(255)  DEFAULT NULL,
  `created_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_category_code` (`category_code`),
  KEY `idx_parent_code` (`parent_code`),
  KEY `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='品类主数据';

-- ---------------------------------------------------
-- 工厂信息表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_factory_info` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `factory_code`   VARCHAR(50)   NOT NULL                COMMENT '工厂编码',
  `factory_name`   VARCHAR(200)  NOT NULL                COMMENT '工厂名称',
  `company_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '所属公司编码',
  `company_name`   VARCHAR(200)  DEFAULT NULL            COMMENT '所属公司名称',
  `type_code`      VARCHAR(50)   DEFAULT NULL            COMMENT '工厂类型编码',
  `type_name`      VARCHAR(100)  DEFAULT NULL            COMMENT '工厂类型名称',
  `is_own`         TINYINT       DEFAULT 1               COMMENT '是否自有：1是 0否',
  `province_code`  VARCHAR(20)   DEFAULT NULL,
  `province_name`  VARCHAR(50)   DEFAULT NULL,
  `city_code`      VARCHAR(20)   DEFAULT NULL,
  `city_name`      VARCHAR(50)   DEFAULT NULL,
  `district_name`  VARCHAR(50)   DEFAULT NULL,
  `address`        VARCHAR(255)  DEFAULT NULL            COMMENT '详细地址',
  `longitude`      DECIMAL(11,8) DEFAULT NULL            COMMENT '经度',
  `latitude`       DECIMAL(11,8) DEFAULT NULL            COMMENT '纬度',
  `status`         TINYINT       DEFAULT 1               COMMENT '1启用 0停用',
  `remark`         VARCHAR(255)  DEFAULT NULL,
  `created_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_factory_code` (`factory_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工厂主数据';

-- ---------------------------------------------------
-- 仓库信息表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_warehouse_info` (
  `id`                  BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `warehouse_code`      VARCHAR(50)   NOT NULL                COMMENT '逻辑仓编码',
  `warehouse_name`      VARCHAR(200)  NOT NULL                COMMENT '仓库名称',
  `biz_warehouse_code`  VARCHAR(50)   DEFAULT NULL            COMMENT '物理仓编码',
  `biz_warehouse_name`  VARCHAR(200)  DEFAULT NULL            COMMENT '物理仓名称',
  `lv1_type_code`       VARCHAR(50)   DEFAULT NULL            COMMENT '一级仓库类型编码',
  `lv1_type_name`       VARCHAR(50)   DEFAULT NULL            COMMENT '一级仓库类型名称（BDC/CDC/RDC/FDC/EDC）',
  `lv2_type_name`       VARCHAR(50)   DEFAULT NULL            COMMENT '二级仓库类型名称',
  `factory_code`        VARCHAR(50)   DEFAULT NULL            COMMENT '所属工厂编码',
  `factory_name`        VARCHAR(200)  DEFAULT NULL            COMMENT '所属工厂名称',
  `warehouse_type_code` VARCHAR(50)   DEFAULT NULL            COMMENT '仓库类型编码',
  `is_own`              TINYINT       DEFAULT 1               COMMENT '是否自有：1是 0否',
  `province_code`       VARCHAR(20)   DEFAULT NULL,
  `province_name`       VARCHAR(50)   DEFAULT NULL,
  `city_code`           VARCHAR(20)   DEFAULT NULL,
  `city_name`           VARCHAR(50)   DEFAULT NULL,
  `district_name`       VARCHAR(50)   DEFAULT NULL,
  `address`             VARCHAR(255)  DEFAULT NULL,
  `longitude`           DECIMAL(11,8) DEFAULT NULL,
  `latitude`            DECIMAL(11,8) DEFAULT NULL,
  `status`              TINYINT       DEFAULT 1               COMMENT '1启用 0停用',
  `remark`              VARCHAR(255)  DEFAULT NULL,
  `created_time`        DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`        DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_warehouse_code` (`warehouse_code`),
  KEY `idx_factory_code` (`factory_code`),
  KEY `idx_lv1_type` (`lv1_type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库主数据';

-- ---------------------------------------------------
-- 渠道信息表（三级树）
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_channel_info` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `channel_code`  VARCHAR(50)   NOT NULL                COMMENT '渠道编码',
  `channel_name`  VARCHAR(100)  NOT NULL                COMMENT '渠道名称',
  `level`         TINYINT       DEFAULT 1               COMMENT '层级：1/2/3',
  `parent_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '父级编码',
  `sort_order`    INT           DEFAULT 0,
  `status`        TINYINT       DEFAULT 1,
  `remark`        VARCHAR(255)  DEFAULT NULL,
  `created_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_code` (`channel_code`),
  KEY `idx_parent_code` (`parent_code`),
  KEY `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='渠道主数据';

-- ---------------------------------------------------
-- 经销商信息表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_reseller_info` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `reseller_code`      VARCHAR(50)   NOT NULL                COMMENT '经销商编码',
  `reseller_name`      VARCHAR(200)  NOT NULL                COMMENT '经销商名称',
  `is_own`             TINYINT       DEFAULT 0               COMMENT '是否自营：1是 0否',
  `lv1_channel_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '一级渠道编码',
  `lv1_channel_name`   VARCHAR(100)  DEFAULT NULL,
  `lv2_channel_code`   VARCHAR(50)   DEFAULT NULL,
  `lv2_channel_name`   VARCHAR(100)  DEFAULT NULL,
  `lv3_channel_code`   VARCHAR(50)   DEFAULT NULL,
  `lv3_channel_name`   VARCHAR(100)  DEFAULT NULL,
  `sale_region_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '销售区域编码',
  `sale_region_name`   VARCHAR(100)  DEFAULT NULL,
  `default_warehouse_code` VARCHAR(50) DEFAULT NULL,
  `default_warehouse_name` VARCHAR(200) DEFAULT NULL,
  `contract_type`      VARCHAR(50)   DEFAULT NULL            COMMENT '合同类型',
  `contract_begin_date` DATE         DEFAULT NULL,
  `contract_end_date`  DATE          DEFAULT NULL,
  `province_name`      VARCHAR(50)   DEFAULT NULL,
  `city_name`          VARCHAR(50)   DEFAULT NULL,
  `district_name`      VARCHAR(50)   DEFAULT NULL,
  `status`             TINYINT       DEFAULT 1,
  `remark`             VARCHAR(255)  DEFAULT NULL,
  `created_time`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reseller_code` (`reseller_code`),
  KEY `idx_lv1_channel` (`lv1_channel_code`),
  KEY `idx_lv3_channel` (`lv3_channel_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='经销商主数据';

-- ---------------------------------------------------
-- 组织机构信息表（三级树）
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_org_info` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `org_code`      VARCHAR(50)   NOT NULL                COMMENT '组织编码',
  `org_name`      VARCHAR(200)  NOT NULL                COMMENT '组织名称',
  `level`         TINYINT       DEFAULT 1               COMMENT '层级：1/2/3',
  `parent_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '父级编码',
  `org_type`      VARCHAR(50)   DEFAULT NULL            COMMENT '组织类型（大区/分公司/营业部）',
  `company_code`  VARCHAR(50)   DEFAULT NULL,
  `company_name`  VARCHAR(200)  DEFAULT NULL,
  `sort_order`    INT           DEFAULT 0,
  `status`        TINYINT       DEFAULT 1,
  `remark`        VARCHAR(255)  DEFAULT NULL,
  `created_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_code` (`org_code`),
  KEY `idx_parent_code` (`parent_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织机构主数据';

-- ---------------------------------------------------
-- 业务日历表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_calendar_info` (
  `id`             BIGINT  NOT NULL AUTO_INCREMENT,
  `cal_date`       DATE    NOT NULL                COMMENT '日期',
  `day_of_week`    TINYINT DEFAULT NULL            COMMENT '星期几（1周一...7周日）',
  `is_workday`     TINYINT DEFAULT 1               COMMENT '是否工作日：1是 0否',
  `is_holiday`     TINYINT DEFAULT 0               COMMENT '是否节假日：1是 0否',
  `is_weekend`     TINYINT DEFAULT 0               COMMENT '是否周末',
  `holiday_name`   VARCHAR(50) DEFAULT NULL        COMMENT '节假日名称',
  `month_of_year`  TINYINT DEFAULT NULL,
  `quarter_of_year` TINYINT DEFAULT NULL,
  `week_of_year`   TINYINT DEFAULT NULL,
  `fscl_year`      SMALLINT DEFAULT NULL           COMMENT '财年',
  `fscl_week_range` VARCHAR(50) DEFAULT NULL       COMMENT '财年周范围',
  `fscl_begin_date` DATE   DEFAULT NULL,
  `fscl_end_date`  DATE    DEFAULT NULL,
  `remark`         VARCHAR(255) DEFAULT NULL,
  `created_time`   DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_time`   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cal_date` (`cal_date`),
  KEY `idx_fscl_year` (`fscl_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务日历';

-- ---------------------------------------------------
-- 仓库-SKU 关系表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_rltn_warehouse_sku` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `warehouse_code` VARCHAR(50)   NOT NULL COMMENT '仓库编码',
  `warehouse_name` VARCHAR(200)  DEFAULT NULL,
  `sku_code`       VARCHAR(50)   NOT NULL COMMENT 'SKU编码',
  `sku_name`       VARCHAR(200)  DEFAULT NULL,
  `begin_date`     DATE          DEFAULT NULL COMMENT '生效开始日期',
  `end_date`       DATE          DEFAULT NULL COMMENT '生效结束日期',
  `status`         TINYINT       DEFAULT 1,
  `remark`         VARCHAR(255)  DEFAULT NULL,
  `created_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wh_sku` (`warehouse_code`, `sku_code`),
  KEY `idx_warehouse_code` (`warehouse_code`),
  KEY `idx_sku_code` (`sku_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库-SKU关系';

-- ---------------------------------------------------
-- 组织-经销商 关系表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_rltn_org_reseller` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `org_code`        VARCHAR(50)   NOT NULL COMMENT '组织编码',
  `org_name`        VARCHAR(200)  DEFAULT NULL,
  `reseller_code`   VARCHAR(50)   NOT NULL COMMENT '经销商编码',
  `reseller_name`   VARCHAR(200)  DEFAULT NULL,
  `lv1_channel_code` VARCHAR(50)  DEFAULT NULL,
  `lv1_channel_name` VARCHAR(100) DEFAULT NULL,
  `begin_date`      DATE          DEFAULT NULL,
  `end_date`        DATE          DEFAULT NULL,
  `status`          TINYINT       DEFAULT 1,
  `remark`          VARCHAR(255)  DEFAULT NULL,
  `created_time`    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_reseller` (`org_code`, `reseller_code`),
  KEY `idx_org_code` (`org_code`),
  KEY `idx_reseller_code` (`reseller_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组织-经销商关系';

-- ---------------------------------------------------
-- 产品-销售SKU 转换关系表
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `mst_rltn_product_sale_sku` (
  `id`            BIGINT          NOT NULL AUTO_INCREMENT,
  `product_code`  VARCHAR(50)     NOT NULL COMMENT '生产产品编码',
  `product_name`  VARCHAR(200)    DEFAULT NULL,
  `sku_code`      VARCHAR(50)     NOT NULL COMMENT '销售SKU编码',
  `sku_name`      VARCHAR(200)    DEFAULT NULL,
  `convert_ratio` DECIMAL(14,4)   DEFAULT 1.0000 COMMENT '转换系数',
  `begin_date`    DATE            DEFAULT NULL,
  `end_date`      DATE            DEFAULT NULL,
  `status`        TINYINT         DEFAULT 1,
  `remark`        VARCHAR(255)    DEFAULT NULL,
  `created_time`  DATETIME        DEFAULT CURRENT_TIMESTAMP,
  `updated_time`  DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_sku` (`product_code`, `sku_code`),
  KEY `idx_product_code` (`product_code`),
  KEY `idx_sku_code` (`sku_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品-销售SKU转换关系';

-- =====================================================================
-- 示例数据
-- =====================================================================

-- 品类示例数据
INSERT IGNORE INTO `mst_category_info` (category_code, category_name, level, parent_code, sort_order) VALUES
('CAT-L1-001', '乳品', 1, NULL, 1),
('CAT-L1-002', '其他', 1, NULL, 2),
('CAT-L2-001', '液态奶', 2, 'CAT-L1-001', 1),
('CAT-L2-002', '固态奶', 2, 'CAT-L1-001', 2),
('CAT-L2-003', '发酵乳', 2, 'CAT-L1-001', 3),
('CAT-L3-001', '低温鲜奶', 3, 'CAT-L2-001', 1),
('CAT-L3-002', '常温纯奶', 3, 'CAT-L2-001', 2),
('CAT-L3-003', '奶粉', 3, 'CAT-L2-002', 1),
('CAT-L3-004', '奶酪', 3, 'CAT-L2-002', 2),
('CAT-L3-005', '风味酸奶', 3, 'CAT-L2-003', 1);

-- 工厂示例数据
INSERT IGNORE INTO `mst_factory_info` (factory_code, factory_name, company_name, type_name, is_own, province_name, city_name, status) VALUES
('FAC-001', '认养一头牛 河北工厂', '认养一头牛控股集团', '自有工厂', 1, '河北省', '石家庄市', 1),
('FAC-002', '认养一头牛 陕西工厂', '认养一头牛控股集团', '自有工厂', 1, '陕西省', '西安市', 1),
('FAC-003', '认养一头牛 江苏代工厂', '江苏合作伙伴公司', '代工工厂', 0, '江苏省', '镇江市', 1);

-- 仓库示例数据
INSERT IGNORE INTO `mst_warehouse_info` (warehouse_code, warehouse_name, lv1_type_name, factory_code, factory_name, is_own, province_name, city_name, status) VALUES
('WH-CDC-001', '华北中央仓', 'CDC', 'FAC-001', '认养一头牛 河北工厂', 1, '河北省', '石家庄市', 1),
('WH-RDC-001', '华东区域仓', 'RDC', NULL, NULL, 1, '江苏省', '南京市', 1),
('WH-RDC-002', '华南区域仓', 'RDC', NULL, NULL, 1, '广东省', '广州市', 1),
('WH-BDC-001', '上海городской仓', 'BDC', NULL, NULL, 0, '上海市', '上海市', 1),
('WH-EDC-001', '北京渠道仓', 'EDC', NULL, NULL, 0, '北京市', '北京市', 1);

-- 渠道示例数据
INSERT IGNORE INTO `mst_channel_info` (channel_code, channel_name, level, parent_code, sort_order) VALUES
('CH-L1-001', '线下渠道', 1, NULL, 1),
('CH-L1-002', '线上渠道', 1, NULL, 2),
('CH-L2-001', 'KA大卖场', 2, 'CH-L1-001', 1),
('CH-L2-002', '便利店', 2, 'CH-L1-001', 2),
('CH-L2-003', '电商平台', 2, 'CH-L1-002', 1),
('CH-L2-004', '社交电商', 2, 'CH-L1-002', 2),
('CH-L3-001', '华润万家', 3, 'CH-L2-001', 1),
('CH-L3-002', '大润发', 3, 'CH-L2-001', 2),
('CH-L3-003', '天猫旗舰店', 3, 'CH-L2-003', 1),
('CH-L3-004', '京东自营', 3, 'CH-L2-003', 2),
('CH-L3-005', '拼多多旗舰店', 3, 'CH-L2-003', 3);

-- 经销商示例数据
INSERT IGNORE INTO `mst_reseller_info` (reseller_code, reseller_name, is_own, lv1_channel_code, lv1_channel_name, lv3_channel_code, lv3_channel_name, sale_region_name, default_warehouse_code, default_warehouse_name, status) VALUES
('RS-001', '上海华联商业有限公司', 0, 'CH-L1-001', '线下渠道', 'CH-L3-001', '华润万家', '华东区', 'WH-RDC-001', '华东区域仓', 1),
('RS-002', '广州百货连锁集团', 0, 'CH-L1-001', '线下渠道', 'CH-L3-002', '大润发', '华南区', 'WH-RDC-002', '华南区域仓', 1),
('RS-003', '认养一头牛天猫旗舰店', 1, 'CH-L1-002', '线上渠道', 'CH-L3-003', '天猫旗舰店', '全国', 'WH-CDC-001', '华北中央仓', 1),
('RS-004', '认养一头牛京东专营店', 1, 'CH-L1-002', '线上渠道', 'CH-L3-004', '京东自营', '全国', 'WH-CDC-001', '华北中央仓', 1);

-- 组织机构示例数据
INSERT IGNORE INTO `mst_org_info` (org_code, org_name, level, parent_code, org_type, sort_order) VALUES
('ORG-001', '华东大区', 1, NULL, '大区', 1),
('ORG-002', '华南大区', 1, NULL, '大区', 2),
('ORG-003', '华北大区', 1, NULL, '大区', 3),
('ORG-001-01', '上海分公司', 2, 'ORG-001', '分公司', 1),
('ORG-001-02', '浙江分公司', 2, 'ORG-001', '分公司', 2),
('ORG-002-01', '广东分公司', 2, 'ORG-002', '分公司', 1),
('ORG-001-01-01', '上海浦东营业部', 3, 'ORG-001-01', '营业部', 1),
('ORG-001-01-02', '上海徐汇营业部', 3, 'ORG-001-01', '营业部', 2);

-- 业务日历示例数据（2026年部分）
INSERT IGNORE INTO `mst_calendar_info` (cal_date, day_of_week, is_workday, is_holiday, is_weekend, holiday_name, month_of_year, quarter_of_year, fscl_year, fscl_week_range) VALUES
('2026-01-01', 4, 0, 1, 0, '元旦', 1, 1, 2026, '2026-W01'),
('2026-01-02', 5, 1, 0, 0, NULL, 1, 1, 2026, '2026-W01'),
('2026-01-03', 6, 0, 0, 1, NULL, 1, 1, 2026, '2026-W01'),
('2026-01-04', 7, 0, 0, 1, NULL, 1, 1, 2026, '2026-W01'),
('2026-01-05', 1, 1, 0, 0, NULL, 1, 1, 2026, '2026-W02'),
('2026-04-01', 3, 1, 0, 0, NULL, 4, 2, 2026, '2026-W14'),
('2026-04-02', 4, 1, 0, 0, NULL, 4, 2, 2026, '2026-W14'),
('2026-04-03', 5, 1, 0, 0, NULL, 4, 2, 2026, '2026-W14'),
('2026-04-04', 6, 0, 1, 1, '清明节', 4, 2, 2026, '2026-W14'),
('2026-04-05', 7, 0, 1, 1, '清明节', 4, 2, 2026, '2026-W14'),
('2026-04-06', 1, 1, 0, 0, NULL, 4, 2, 2026, '2026-W15'),
('2026-04-07', 2, 1, 0, 0, NULL, 4, 2, 2026, '2026-W15'),
('2026-05-01', 5, 0, 1, 0, '劳动节', 5, 2, 2026, '2026-W18'),
('2026-05-02', 6, 0, 1, 1, '劳动节', 5, 2, 2026, '2026-W18'),
('2026-05-03', 7, 0, 1, 1, '劳动节', 5, 2, 2026, '2026-W18'),
('2026-05-04', 1, 1, 0, 0, NULL, 5, 2, 2026, '2026-W19');

-- 仓库-SKU关系示例数据
INSERT IGNORE INTO `mst_rltn_warehouse_sku` (warehouse_code, warehouse_name, sku_code, sku_name, begin_date, end_date, status) VALUES
('WH-CDC-001', '华北中央仓', 'SKU-P001', '认养一头牛 全脂纯牛奶 200ml×12盒', '2026-01-01', '2026-12-31', 1),
('WH-CDC-001', '华北中央仓', 'SKU-U001', '认养一头牛 常温全脂牛奶 250ml×12盒', '2026-01-01', '2026-12-31', 1),
('WH-RDC-001', '华东区域仓', 'SKU-P001', '认养一头牛 全脂纯牛奶 200ml×12盒', '2026-01-01', '2026-12-31', 1),
('WH-RDC-002', '华南区域仓', 'SKU-U001', '认养一头牛 常温全脂牛奶 250ml×12盒', '2026-01-01', '2026-12-31', 1);

-- 组织-经销商关系示例数据
INSERT IGNORE INTO `mst_rltn_org_reseller` (org_code, org_name, reseller_code, reseller_name, lv1_channel_code, lv1_channel_name, begin_date, status) VALUES
('ORG-001-01', '上海分公司', 'RS-001', '上海华联商业有限公司', 'CH-L1-001', '线下渠道', '2026-01-01', 1),
('ORG-002-01', '广东分公司', 'RS-002', '广州百货连锁集团', 'CH-L1-001', '线下渠道', '2026-01-01', 1);

-- 产品-销售SKU转换关系示例数据
INSERT IGNORE INTO `mst_rltn_product_sale_sku` (product_code, product_name, sku_code, sku_name, convert_ratio, begin_date, status) VALUES
('PRD-001', '全脂纯牛奶生产品200ml', 'SKU-P001', '认养一头牛 全脂纯牛奶 200ml×12盒', 12.0000, '2026-01-01', 1),
('PRD-002', '常温全脂牛奶生产品250ml', 'SKU-U001', '认养一头牛 常温全脂牛奶 250ml×12盒', 12.0000, '2026-01-01', 1),
('PRD-003', '风味发酵乳生产品100g', 'SKU-Y001', '认养一头牛 风味发酵乳 100g×12杯', 12.0000, '2026-01-01', 1);
