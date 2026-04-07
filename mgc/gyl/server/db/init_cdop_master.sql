-- 创建 cdop_master 数据库（如不存在）
CREATE DATABASE IF NOT EXISTS `cdop_master` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE `cdop_master`;

-- 创建 mst_sku_info 表
CREATE TABLE IF NOT EXISTS `mst_sku_info` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `sku_code`        VARCHAR(50)   NOT NULL                COMMENT 'SKU编码',
  `sku_name`        VARCHAR(200)  NOT NULL                COMMENT 'SKU名称',
  `bar_code`        VARCHAR(50)   DEFAULT NULL            COMMENT '69码/国际条码',
  `category_code`   VARCHAR(50)   DEFAULT NULL            COMMENT '品类编码',
  `lifecycle_status` VARCHAR(20)  DEFAULT 'ACTIVE'        COMMENT '生命周期：ACTIVE / INACTIVE / OBSOLETE',
  `shelf_life_days` INT           DEFAULT 0               COMMENT '保质期（天）',
  `unit_ratio`      DECIMAL(10,3) DEFAULT 1.000           COMMENT '单位换算比例（大包->单支）',
  `volume_m3`       DECIMAL(10,6) DEFAULT 0.000000        COMMENT '规格体积 m³',
  `status`          TINYINT       DEFAULT 1               COMMENT '数据状态：1正常，0已删除',
  `created_time`    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_time`    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sku_code` (`sku_code`),
  KEY `idx_sku_name` (`sku_name`(64)),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='SKU主数据';

-- 清理旧数据（幂等）
TRUNCATE TABLE `mst_sku_info`;

-- 插入真实模拟数据（认养一头牛 / 乳品供应链场景）
INSERT INTO `mst_sku_info`
  (sku_code, sku_name, bar_code, category_code, lifecycle_status, shelf_life_days, unit_ratio, volume_m3)
VALUES
-- 纯牛奶系列
('SKU-P001','认养一头牛 全脂纯牛奶 200ml×12盒','6901234567890','MILK-FRESH','ACTIVE',7 ,12 ,0.003200),
('SKU-P002','认养一头牛 娟姗鲜牛乳 200ml×12盒','6901234567891','MILK-FRESH','ACTIVE',7 ,12 ,0.003200),
('SKU-P003','认养一头牛 脱脂纯牛奶 200ml×12盒','6901234567892','MILK-FRESH','ACTIVE',7 ,12 ,0.003200),
('SKU-P004','认养一头牛 高钙纯牛奶 250ml×10盒','6901234567893','MILK-FRESH','ACTIVE',7 ,10 ,0.003500),
('SKU-P005','认养一头牛 A2β-酪蛋白牛奶 200ml×12盒','6901234567894','MILK-FRESH','ACTIVE',7 ,12 ,0.003200),
('SKU-P006','认养一头牛 有机全脂牛奶 190ml×12支','6901234567895','MILK-ORGANIC','ACTIVE',15,12 ,0.003000),
('SKU-P007','认养一头牛 低温巴氏奶 1L×4瓶','6901234567896','MILK-FRESH','ACTIVE',10,4  ,0.004800),

-- 常温奶系列
('SKU-U001','认养一头牛 常温全脂牛奶 250ml×12盒','6902345678900','MILK-UHT','ACTIVE',180,12,0.004000),
('SKU-U002','认养一头牛 常温脱脂牛奶 250ml×12盒','6902345678901','MILK-UHT','ACTIVE',180,12,0.004000),
('SKU-U003','认养一头牛 有机常温牛奶 250ml×12盒','6902345678902','MILK-UHT-ORG','ACTIVE',180,12,0.004000),
('SKU-U004','认养一头牛 高端娟姗UHT 250ml×12盒','6902345678903','MILK-UHT','ACTIVE',180,12,0.004000),
('SKU-U005','认养一头牛 常温草饲牛奶 200ml×24盒','6902345678904','MILK-UHT','ACTIVE',180,24,0.005800),

-- 酸奶系列
('SKU-Y001','认养一头牛 风味发酵乳 100g×12杯','6903456789010','YOGURT','ACTIVE',21 ,12 ,0.002800),
('SKU-Y002','认养一头牛 希腊风味酸奶 135g×6杯','6903456789011','YOGURT','ACTIVE',21 ,6  ,0.001600),
('SKU-Y003','认养一头牛 减糖原生酸奶 135g×6杯','6903456789012','YOGURT-LIGHT','ACTIVE',21 ,6  ,0.001600),
('SKU-Y004','认养一头牛 白桃风味酸奶 100g×12杯','6903456789013','YOGURT','ACTIVE',21 ,12 ,0.002800),
('SKU-Y005','认养一头牛 芒果百香果酸奶 135g×6杯','6903456789014','YOGURT','ACTIVE',21 ,6  ,0.001600),
('SKU-Y006','认养一头牛 益生菌酸奶 200g×4杯','6903456789015','YOGURT-PRO','ACTIVE',30 ,4  ,0.001800),
('SKU-Y007','认养一头牛 大果粒草莓酸奶 150g×8杯','6903456789016','YOGURT','ACTIVE',21 ,8  ,0.002000),
('SKU-Y008','认养一头牛 有机纯酸奶(无糖) 200g×6杯','6903456789017','YOGURT-ORGANIC','ACTIVE',21,6 ,0.002000),

-- 奶粉系列
('SKU-F001','认养一头牛 成人全脂奶粉 800g×1罐','6904567890100','POWDER','ACTIVE',365,1  ,0.001200),
('SKU-F002','认养一头牛 高钙成人奶粉 800g×1罐','6904567890101','POWDER','ACTIVE',365,1  ,0.001200),
('SKU-F003','认养一头牛 青少年配方奶粉 400g×1罐','6904567890102','POWDER-TEEN','ACTIVE',365,1  ,0.000700),
('SKU-F004','认养一头牛 中老年益生菌奶粉 800g×1罐','6904567890103','POWDER-ELDER','ACTIVE',365,1,0.001200),
('SKU-F005','认养一头牛 全家营养奶粉 1000g×1袋','6904567890104','POWDER','ACTIVE',365,1  ,0.001400),

-- 奶酪系列
('SKU-C001','认养一头牛 儿童零食奶酪棒 混合口味 20g×10支','6905678901000','CHEESE','ACTIVE',60 ,10 ,0.001000),
('SKU-C002','认养一头牛 奶酪高钙片 原味 100g×1盒','6905678901001','CHEESE','ACTIVE',90 ,1  ,0.000300),
('SKU-C003','认养一头牛 马苏里拉奶酪丝 200g×1袋','6905678901002','CHEESE-MOZZ','ACTIVE',30 ,1  ,0.000400),

-- 奶油/黄油
('SKU-B001','认养一头牛 动物淡奶油 200ml×1盒','6906789012000','CREAM','ACTIVE',30 ,1  ,0.000350),
('SKU-B002','认养一头牛 天然黄油 100g×1块','6906789012001','BUTTER','ACTIVE',180,1  ,0.000200),

-- 联名跨界
('SKU-X001','认养一头牛×小黄人 燕麦奶 250ml×10盒','6907890123000','COLLAB','ACTIVE',180,10 ,0.003800),
('SKU-X002','认养一头牛 生牛乳冰淇淋 棒冰 75g×6支','6907890123001','ICE-CREAM','ACTIVE',180,6  ,0.001400),
('SKU-X003','认养一头牛×故宫 礼盒装鲜奶 200ml×6盒','6907890123002','COLLAB','ACTIVE',7  ,6  ,0.002200),

-- 礼盒/套装
('SKU-G001','认养一头牛 鲜活礼盒A（纯牛奶+酸奶） 混合','6908901234000','GIFT','ACTIVE',7  ,1  ,0.005000),
('SKU-G002','认养一头牛 奶粉高端礼盒 800g+200g',        '6908901234001','GIFT','ACTIVE',365,1  ,0.002000),
('SKU-G003','认养一头牛 新年礼盒（12品汇选）',           '6908901234002','GIFT','ACTIVE',30 ,1  ,0.010000),

-- 已停用/下市品
('SKU-D001','认养一头牛 试饮装纯牛奶 100ml×12盒','6909012345000','MILK-FRESH','INACTIVE',7 ,12 ,0.001800),
('SKU-D002','认养一头牛 旧版风味酸奶 100g×8杯',  '6909012345001','YOGURT',    'OBSOLETE',21,8  ,0.001600);
