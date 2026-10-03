// Approved employee roster from the owner's image. Server-side only.
// Phone numbers preserve the supplied roster exactly, including leading zeros.
export const initialPositions = [
  { id: 'manager', name: 'Manager' },
  { id: 'sale', name: 'Sale' },
  { id: 'sale-admin', name: 'Sale Admin' },
  { id: 'sales-ml', name: 'NVBH ML' },
  { id: 'sales-lock', name: 'NVBH LOCK' },
  { id: 'warehouse', name: 'Kho' },
  { id: 'accounting', name: 'Kế toán' },
  { id: 'supplier', name: 'NCC' },
];

export const initialStaff = [
  { id: 'NV001', phone: '0907168234', name: 'Huỳnh Châu Yến', email: 'sale@quatangvigifts.com', role: 'manager', positionId: 'manager' },
  { id: 'NV002', phone: '0939961969', name: 'Lê Minh Thái', email: 'info@quatangvigifts.com', role: 'manager', positionId: 'manager' },
  { id: 'NV003', phone: '0939089234', name: 'Trần Thị Bé Ngọc', email: 'ngoctran@quatangvigifts.com', role: 'employee', positionId: 'sale' },
  { id: 'NV004', phone: '0939046234', name: 'Lê Thị Phương Du', email: 'phuongdu@quatangvigifts.com', role: 'employee', positionId: 'sale' },
  { id: 'NV005', phone: '0907372068', name: 'Phạm Thuỳ Tiên', email: 'thuytien@quatangvigifts.com', role: 'employee', positionId: 'sale-admin' },
  { id: 'NV006', phone: '0939692234', name: 'Huỳnh Thị Vân Anh', email: 'vananh@quatangvigifts.com', role: 'employee', positionId: 'sale' },
  { id: 'NV007', phone: '0779424416', name: 'Cao Lưu Phượng Vy', email: 'phuongvy@quatangvigifts.com', role: 'employee', positionId: 'sale-admin' },
  { id: 'NV008', phone: '0796669896', name: 'Tâm - Phong', email: 'kho@quatangvigifts.com', role: 'employee', positionId: 'warehouse' },
  { id: 'NV009', phone: '0901224389', name: 'Kế toán', email: 'ketoan@quatangvigifts.com', role: 'employee', positionId: 'accounting' },
  { id: 'NV10', phone: '0813290131', name: 'claw@quatangvigifts.com', email: 'claw@quatangvigifts.com', role: 'manager', positionId: 'manager' },
];
