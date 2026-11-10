// 保存榀位变换前后的位置。侧视使用原始位置，离开侧视恢复实际东西坡度。
// 只切换显示矩阵，不更改计算结果或型材几何。
export function captureFramePose(object) {
  if (object.isInstancedMesh) return object.instanceMatrix.array.slice();
  return object.matrixAutoUpdate ? object.position.clone() : object.matrix.clone();
}

export function setFlatFrameDisplay(root, flat) {
  root.traverse(object => {
    const poses = object.userData.frameDisplay;
    if (!poses || poses.flat === flat) return;
    const pose = flat ? poses.level : poses.sloped;
    if (object.isInstancedMesh) {
      object.instanceMatrix.array.set(pose);
      object.instanceMatrix.needsUpdate = true;
    } else if (object.matrixAutoUpdate) object.position.copy(pose);
    else object.matrix.copy(pose);
    object.matrixWorldNeedsUpdate = true;
    poses.flat = flat;
  });
}
