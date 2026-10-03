-- Correct the shared Sale classification for the employee identified by the owner.
UPDATE staff_members SET position_id='sales-lock'
WHERE id='SAPO-1302105' AND name='Cao Mỵ Nương' AND position_id='sale'
AND EXISTS(SELECT 1 FROM staff_positions WHERE id='sales-lock');
