#!/bin/bash
set -e

BACKUP_DIR="/backup/offerpilot"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="${OFFERPILOT_BACKEND_CONTAINER:-offerpilot-offerpilot-1}"
POSTGRES_CONTAINER="${OFFERPILOT_POSTGRES_CONTAINER:-offerpilot-postgres-1}"

echo "💾 开始备份 OfferPilot 数据..."
echo ""

# 创建备份目录
mkdir -p $BACKUP_DIR

# 检查容器是否运行
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "❌ 容器 $CONTAINER_NAME 未运行"
    exit 1
fi

# 备份数据库（SQLite 与 PostgreSQL 均保留，便于回滚）
echo "[1/3] 备份数据库..."
if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  docker exec "$POSTGRES_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$BACKUP_DIR/db_$DATE.dump"
  echo "✓ PostgreSQL 备份完成: db_$DATE.dump"
fi
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker exec "$CONTAINER_NAME" cp /app/data-v2/offerpilot.sqlite /app/data-v2/offerpilot.sqlite.backup
  docker cp "$CONTAINER_NAME:/app/data-v2/offerpilot.sqlite.backup" "$BACKUP_DIR/db_$DATE.sqlite"
  echo "✓ SQLite 备份完成: db_$DATE.sqlite"
fi

# 备份上传文件
echo "[2/3] 备份上传文件..."
docker cp $CONTAINER_NAME:/app/data-v2/uploads $BACKUP_DIR/uploads_$DATE
echo "✓ 上传文件备份完成: uploads_$DATE"

# 清理旧备份（保留 7 天）
echo "[3/3] 清理旧备份..."
DELETED_DB=$(find "$BACKUP_DIR" \( -name "db_*.sqlite" -o -name "db_*.dump" \) -mtime +7 | wc -l)
DELETED_UPLOADS=$(find $BACKUP_DIR -name "uploads_*" -mtime +7 -type d | wc -l)
find "$BACKUP_DIR" \( -name "db_*.sqlite" -o -name "db_*.dump" \) -mtime +7 -delete
find "$BACKUP_DIR" -name "uploads_*" -mtime +7 -exec rm -rf {} +
echo "✓ 已清理 $DELETED_DB 个旧数据库备份"
echo "✓ 已清理 $DELETED_UPLOADS 个旧上传文件备份"

# 显示备份信息
echo ""
echo "✅ 备份完成！"
echo "备份位置: $BACKUP_DIR"
echo "备份时间: $DATE"
echo ""
echo "备份文件:"
ls -lh $BACKUP_DIR/*_$DATE* | awk '{print "  " $9 " (" $5 ")"}'

# 计算总备份大小
TOTAL_SIZE=$(du -sh $BACKUP_DIR | awk '{print $1}')
echo ""
echo "总备份大小: $TOTAL_SIZE"
