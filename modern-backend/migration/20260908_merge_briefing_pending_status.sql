-- Merge the retired 'ดำเนินการ' briefing status into 'รอดำเนินการ'.
--
-- addBriefing() used to write 'ดำเนินการ' while every counter, filter and
-- scoring rule was keyed on 'รอดำเนินการ' (the column default, and the only
-- label BriefingResponses ever used).  The briefing board therefore showed
-- "รอดำเนินการ = 0" no matter how much work was waiting, and MyTeam counted the
-- same briefings as "กำลังทำ".  The client now writes only 'รอดำเนินการ'; this
-- backfills the rows created before that change.
--
-- Idempotent: running it twice updates nothing the second time.

UPDATE "Briefings"
SET "Status" = 'รอดำเนินการ'
WHERE "Status" = 'ดำเนินการ';

UPDATE "BriefingResponses"
SET "Status" = 'รอดำเนินการ'
WHERE "Status" = 'ดำเนินการ';
