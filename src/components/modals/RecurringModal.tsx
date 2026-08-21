import { useMemo, useState } from 'react'
import type { RecurringModalInit } from '../../App'
import { uid, useStore } from '../../store'
import type { Freq, RecurException, RecurKind, RecurRule, RecurringTask } from '../../types'
import { hmToMin, minToHm, todayISO, WEEKDAYS } from '../../utils/date'
import { occurrenceAt, type EditScope } from '../../utils/occur'
import ColorSelect, { type ColorGroup } from '../ColorSelect'
import InfoIcon from '../InfoIcon'
import TimeSelect from '../TimeSelect'
import Modal from './Modal'
import {
  decodeProjectSection, encodeProjectSection, projectSectionColorOptions, projectSectionOptions,
} from './TaskModal'

const KINDS: [RecurKind, string][] = [
  ['daily', 'Every day'],
  ['weekdays', 'Weekdays'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Every other week'],
  ['monthly', 'Monthly'],
  ['timesPerDay', 'Several times a day'],
]

/** The rule a stored task edits from — legacy freq/weekday when it has none. */
function initialRule(rt: RecurringTask | undefined): RecurRule {
  if (rt?.rule) return rt.rule
  const kind: RecurKind = rt?.freq ?? 'daily'
  return { kind, weekdays: kind === 'weekly' ? [rt?.weekday ?? 1] : undefined }
}

export default function RecurringModal({ init, onClose }: { init: RecurringModalInit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const rt = init.rt
  // The occurrence the user opened, when they came from the calendar: edits
  // then get a scope, exactly like a repeating event's.
  const occurrence = rt && init.occurrence ? init.occurrence : null
  const occ = rt && occurrence ? occurrenceAt(rt, occurrence) : null

  const opts = projectSectionOptions(state)
  const [title, setTitle] = useState(rt?.title ?? init.title ?? '')
  const [target, setTarget] = useState<string>(() => {
    const pid = rt?.projectId ?? init.projectId ?? opts[0]?.projectId ?? ''
    const sid = rt?.sectionId ?? init.sectionId ?? null
    return pid ? encodeProjectSection(pid, sid) : (opts[0]?.value ?? '')
  })
  const [scope, setScope] = useState<EditScope>('one')
  const base = initialRule(rt)
  const [kind, setKind] = useState<RecurKind>(base.kind)
  const [weekdays, setWeekdays] = useState<number[]>(
    base.weekdays?.length ? base.weekdays : [rt?.weekday ?? 1],
  )
  const [anchor, setAnchor] = useState(base.anchor ?? rt?.startDate ?? todayISO())
  const [monthDay, setMonthDay] = useState(base.day ?? Number((rt?.startDate ?? todayISO()).slice(8)))
  const [times, setTimes] = useState(base.times ?? 3)
  const [streak, setStreak] = useState(rt?.streak ?? true)

  // Scheduling: an occurrence can carry a time block and a deadline offset.
  const [hasTime, setHasTime] = useState(rt?.startMin != null)
  const [start, setStart] = useState(minToHm(rt?.startMin ?? 9 * 60))
  const [hasBlock, setHasBlock] = useState(rt?.endMin != null)
  const [end, setEnd] = useState(minToHm(rt?.endMin ?? 10 * 60))
  const [hasDue, setHasDue] = useState(rt?.dueOffsetDays != null)
  const [dueOffset, setDueOffset] = useState(rt?.dueOffsetDays ?? 0)
  const [hasDueTime, setHasDueTime] = useState(rt?.dueMin != null)
  const [dueTime, setDueTime] = useState(minToHm(rt?.dueMin ?? 17 * 60))

  // The one-occurrence arm edits concrete dates instead of the rule.
  const [occDate, setOccDate] = useState(occ?.date ?? occurrence ?? todayISO())
  const [occHasTime, setOccHasTime] = useState(occ?.startMin != null)
  const [occStart, setOccStart] = useState(minToHm(occ?.startMin ?? 9 * 60))
  const [occHasBlock, setOccHasBlock] = useState(occ?.endMin != null)
  const [occEnd, setOccEnd] = useState(minToHm(occ?.endMin ?? 10 * 60))
  const [occDue, setOccDue] = useState(occ?.dueDate ?? '')
  const [occHasDueTime, setOccHasDueTime] = useState(occ?.dueMin != null)
  const [occDueTime, setOccDueTime] = useState(minToHm(occ?.dueMin ?? 17 * 60))

  const projectGroups = useMemo<ColorGroup[]>(
    () => [{ options: projectSectionColorOptions(state) }],
    [state],
  )

  /** Only this occurrence: the series rule and its name are off limits. */
  const onlyThis = !!occurrence && scope === 'one'

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const buildRule = (): RecurRule => {
    switch (kind) {
      case 'weekly':
      case 'biweekly':
        return {
          kind,
          weekdays: weekdays.length ? weekdays : [rt?.weekday ?? 1],
          anchor: kind === 'biweekly' ? anchor : undefined,
        }
      case 'monthly':
        return { kind, day: Math.min(31, Math.max(1, Math.round(monthDay))) }
      case 'timesPerDay':
        return { kind, times: Math.min(12, Math.max(1, Math.round(times))) }
      default:
        return { kind }
    }
  }

  /** Series fields as the form has them — the payload of an 'all'/'future' save. */
  const buildSeries = (): RecurringTask | null => {
    const { projectId, sectionId } = decodeProjectSection(target)
    if (!projectId) return null // recurring tasks always belong to a project
    const rule = buildRule()
    const startMin = hasTime ? hmToMin(start) : null
    let endMin = startMin != null && hasBlock ? hmToMin(end) : null
    if (endMin != null && startMin != null && endMin <= startMin) endMin = Math.min(startMin + 30, 24 * 60)
    return {
      id: rt?.id ?? uid(),
      title: title.trim(),
      projectId,
      sectionId,
      // The legacy pair is kept in step so anything still reading it (and any
      // older build reading this data back) behaves sensibly.
      freq: (['daily', 'weekdays', 'weekly'].includes(rule.kind) ? rule.kind : 'weekly') as Freq,
      weekday: rule.weekdays?.[0] ?? rt?.weekday ?? 1,
      rule,
      startDate: rt?.startDate ?? todayISO(),
      until: rt?.until,
      streak,
      completions: rt?.completions ?? [],
      partial: rt?.partial,
      exceptions: rt?.exceptions,
      startMin,
      endMin,
      dueOffsetDays: hasDue ? Math.max(0, Math.round(dueOffset)) : undefined,
      dueMin: hasDue && hasDueTime ? hmToMin(dueTime) : undefined,
    }
  }

  /** This occurrence's overrides — the payload of a 'one' save. */
  const buildException = (): RecurException => {
    const startMin = occHasTime ? hmToMin(occStart) : null
    let endMin = startMin != null && occHasBlock ? hmToMin(occEnd) : null
    if (endMin != null && startMin != null && endMin <= startMin) endMin = Math.min(startMin + 30, 24 * 60)
    return {
      date: occDate,
      startMin,
      endMin,
      dueDate: occDue || undefined,
      dueMin: occDue && occHasDueTime ? hmToMin(occDueTime) : null,
    }
  }

  const save = () => {
    if (onlyThis && rt && occurrence) {
      dispatch({ type: 'editRecurringOccurrence', id: rt.id, occurrence, scope: 'one', patch: buildException() })
      onClose()
      return
    }
    if (!title.trim()) return
    const next = buildSeries()
    if (!next) return
    if (rt && occurrence && scope === 'future') {
      const { id: _id, ...series } = next
      dispatch({
        type: 'editRecurringOccurrence',
        id: rt.id, occurrence, scope: 'future',
        patch: { date: occDate },
        series,
      })
      onClose()
      return
    }
    dispatch({ type: rt ? 'updateRecurring' : 'addRecurring', rt: next })
    onClose()
  }

  const remove = () => {
    if (!rt) return
    if (occurrence && scope === 'one') {
      dispatch({ type: 'editRecurringOccurrence', id: rt.id, occurrence, scope: 'one', patch: { skip: true } })
    } else if (occurrence && scope === 'future' && occurrence > rt.startDate) {
      dispatch({ type: 'updateRecurring', rt: { ...rt, until: occurrence } })
    } else {
      dispatch({ type: 'deleteRecurring', id: rt.id })
    }
    onClose()
  }

  return (
    <Modal title={rt ? 'Edit recurring task' : 'New recurring task'} onClose={onClose}>
      {occurrence && (
        <div className="field">
          <label>
            Apply changes / delete
            <InfoIcon text="“Only this” records an override for the one occurrence — the series itself is untouched. “This and future” ends the series here and carries your changes forward from this occurrence on. “All” edits the whole series." />
          </label>
          <div className="scope-row">
            {([
              ['one', 'Only this occurrence'],
              ['future', 'This and future'],
              ['all', 'All occurrences'],
            ] as const).map(([value, label]) => (
              <label key={value} className="scope-opt">
                <input type="radio" name="rec-scope" checked={scope === value} onChange={() => setScope(value)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {onlyThis ? (
        <div className="modal-section">
          <div className="modal-section-label">This occurrence</div>
          <div className="field">
            <label>Date <InfoIcon text="Move just this occurrence. The rest of the series keeps its own schedule." /></label>
            <input type="date" value={occDate} onChange={(e) => setOccDate(e.target.value)} />
          </div>
          <label className="check-line">
            <input type="checkbox" className="cb" checked={occHasTime}
              onChange={(e) => setOccHasTime(e.target.checked)} />
            Set a time
          </label>
          {occHasTime && (
            <>
              <div className="field">
                <label>Time</label>
                <TimeSelect value={occStart} onChange={setOccStart} />
              </div>
              <label className="check-line">
                <input type="checkbox" className="cb" checked={occHasBlock}
                  onChange={(e) => setOccHasBlock(e.target.checked)} />
                Block out expected time
              </label>
              {occHasBlock && (
                <div className="field">
                  <label>Until</label>
                  <TimeSelect value={occEnd} onChange={setOccEnd} />
                </div>
              )}
            </>
          )}
          <div className="field">
            <label>Due date <InfoIcon text="When this one occurrence has to be handed in. Empty = no deadline for this occurrence." /></label>
            <input type="date" value={occDue} onChange={(e) => setOccDue(e.target.value)} />
          </div>
          {occDue && (
            <>
              <label className="check-line">
                <input type="checkbox" className="cb" checked={occHasDueTime}
                  onChange={(e) => setOccHasDueTime(e.target.checked)} />
                Due at a time
                <InfoIcon text="Off = end of day (11:59pm)." />
              </label>
              {occHasDueTime && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Due at</label>
                  <TimeSelect value={occDueTime} onChange={setOccDueTime} />
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label>Name</label>
            <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Review flashcards" />
          </div>

          <div className="field">
            <label>Project</label>
            <ColorSelect value={target} groups={projectGroups} onChange={setTarget} title="Project" />
          </div>

          <div className="modal-section">
            <div className="modal-section-label">Repeats</div>
            <div className="field">
              <label>How often</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as RecurKind)}>
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            {(kind === 'weekly' || kind === 'biweekly') && (
              <div className="field">
                <label>
                  On
                  <InfoIcon text="Pick as many days as you like — a seminar prep that happens Monday and Thursday is one recurring task, not two." />
                </label>
                <div className="rt-days">
                  {WEEKDAYS.map((d, i) => (
                    <button key={d} type="button"
                      className={`rt-day${weekdays.includes(i) ? ' on' : ''}`}
                      onClick={() => toggleDay(i)}>{d[0]}</button>
                  ))}
                </div>
              </div>
            )}

            {kind === 'biweekly' && (
              <div className="field">
                <label>
                  Starting the week of
                  <InfoIcon text="Which fortnight is the “on” one. Every occurrence falls in the same week of the cycle as this date." />
                </label>
                <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </div>
            )}

            {kind === 'monthly' && (
              <div className="field">
                <label>
                  Day of the month
                  <InfoIcon text="Months that are too short use their last day instead — 31 lands on the 30th in April and on the 28th in February." />
                </label>
                <input type="number" min={1} max={31} value={monthDay}
                  onChange={(e) => setMonthDay(Number(e.target.value))} />
              </div>
            )}

            {kind === 'timesPerDay' && (
              <div className="field">
                <label>
                  Times a day
                  <InfoIcon text="Each qualifying day gets this many boxes to tick. The day only counts as done — and only feeds the streak — once every box is filled." />
                </label>
                <input type="number" min={1} max={12} value={times}
                  onChange={(e) => setTimes(Number(e.target.value))} />
              </div>
            )}
          </div>

          <div className="modal-section">
            <div className="modal-section-label">Schedule — when you'll work on it</div>
            <label className="check-line">
              <input type="checkbox" className="cb" checked={hasTime}
                onChange={(e) => setHasTime(e.target.checked)} />
              Set a time
              <InfoIcon text="Off = the occurrence sits in the all-day lane. On = it gets a chip on the time grid, draggable like anything else." />
            </label>
            {hasTime && (
              <>
                <div className="field">
                  <label>Time</label>
                  <TimeSelect value={start} onChange={setStart} />
                </div>
                <label className="check-line">
                  <input type="checkbox" className="cb" checked={hasBlock}
                    onChange={(e) => setHasBlock(e.target.checked)} />
                  Block out expected time
                </label>
                {hasBlock && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Until</label>
                    <TimeSelect value={end} onChange={setEnd} />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="modal-section">
            <div className="modal-section-label">Due — when each one must be in</div>
            <label className="check-line">
              <input type="checkbox" className="cb" checked={hasDue}
                onChange={(e) => setHasDue(e.target.checked)} />
              Each occurrence has a deadline
              <InfoIcon text="The deadline is measured from the occurrence's own day, so a problem set scheduled Monday with an offset of 4 days is due that Friday — every week, without setting a date by hand." />
            </label>
            {hasDue && (
              <>
                <div className="field">
                  <label>Days after the occurrence</label>
                  <input type="number" min={0} max={60} value={dueOffset}
                    onChange={(e) => setDueOffset(Number(e.target.value))} />
                </div>
                <label className="check-line">
                  <input type="checkbox" className="cb" checked={hasDueTime}
                    onChange={(e) => setHasDueTime(e.target.checked)} />
                  Due at a time
                  <InfoIcon text="Off = end of day (11:59pm)." />
                </label>
                {hasDueTime && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Due at</label>
                    <TimeSelect value={dueTime} onChange={setDueTime} />
                  </div>
                )}
              </>
            )}
          </div>

          <label className="check-line">
            <input type="checkbox" className="cb" checked={streak} onChange={(e) => setStreak(e.target.checked)} />
            Show streak / habit tracker
          </label>
        </>
      )}

      <div className="modal-actions">
        {rt && (
          <button className="btn danger" onClick={remove}>
            Delete{occurrence ? (scope === 'all' ? ' all' : scope === 'future' ? ' this + future' : ' this one') : ''}
          </button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{rt ? 'Save' : 'Create'}</button>
      </div>
    </Modal>
  )
}
