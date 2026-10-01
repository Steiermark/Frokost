ALTER TABLE `menus` ADD `released` integer DEFAULT 1 NOT NULL;
INSERT OR IGNORE INTO `menus` (`date`, `source`, `released`)
SELECT `date`, COALESCE(MAX(NULLIF(TRIM(`source`), '')), ''), 1
FROM `dishes`
GROUP BY `date`;
