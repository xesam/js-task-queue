#!/bin/bash

# 安全发布脚本
# 只有在 npm 发布成功后，才会执行 Git 提交和打标签

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}当前版本: $CURRENT_VERSION${NC}"

# 询问新版本号
read -p "请输入新版本号 (例如: 0.0.1): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}错误: 版本号不能为空${NC}"
    exit 1
fi

# 验证版本号格式
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$ ]]; then
    echo -e "${RED}错误: 版本号格式不正确，请使用语义化版本格式 (如: 0.0.1)${NC}"
    exit 1
fi

echo -e "${YELLOW}准备发布版本: $NEW_VERSION${NC}"

# 检查工作区是否干净
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}错误: 工作区有未提交的更改，请先提交或暂存${NC}"
    git status --short
    exit 1
fi

# 运行测试
echo -e "${YELLOW}运行测试...${NC}"
npm test
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 测试失败，发布已取消${NC}"
    exit 1
fi

# 更新版本号
echo -e "${YELLOW}更新 package.json 版本号...${NC}"
npm version "$NEW_VERSION" --no-git-tag-version

# 构建项目
echo -e "${YELLOW}构建项目...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 构建失败，恢复版本号${NC}"
    git checkout -- package.json
    exit 1
fi

# 尝试发布到 npm
echo -e "${YELLOW}发布到 npm...${NC}"
if npm publish; then
    echo -e "${GREEN}npm 发布成功!${NC}"
    
    # 只有在发布成功后，才执行 Git 操作
    echo -e "${YELLOW}提交版本号更改...${NC}"
    git add package.json
    git commit -m "chore(release): v$NEW_VERSION"
    
    echo -e "${YELLOW}创建版本标签...${NC}"
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
    
    echo -e "${GREEN}发布完成!${NC}"
    echo -e "${GREEN}版本: $NEW_VERSION${NC}"
    echo -e "${YELLOW}请手动执行: git push origin main --tags${NC}"
else
    echo -e "${RED}npm 发布失败，回退所有修改...${NC}"
    
    # 恢复 package.json
    git checkout -- package.json
    
    # 清理构建产物
    npm run clean
    
    echo -e "${RED}已回退所有修改，请检查错误后重试${NC}"
    exit 1
fi
