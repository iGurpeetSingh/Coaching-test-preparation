import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import "./fee-page.css";

type Student = {
  id: string; admission_id: string; student_number: string; full_name: string;
  mobile: string | null; admission_number: string; branch_name: string; course_name: string;
};
type Charge = {
  id: string; student_id: string; student_number: string; student_name: string;
  admission_id: string; admission_number: string; charge_code: string; description: string;
  amount: string | number; paid_amount: string | number; balance_amount: string | number;
  due_date: string | null; status: string; branch_id: string;
};
type Payment = {
  id: string; student_number: string; student_name: string; receipt_number: string;
  payment_date: string; amount: string | number; method: string; reference: string | null;
  status: string; allocated_amount: string | number;
};
type Props = { permissions: string[] };
const fmtMoney = (value: string | number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const fmtDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-IN") : "—";
const errText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function FeeManagementPage({ permissions }: Props) {
  const canManage = permissions.includes("fees.manage");
  const [students, setStudents] = useState<Student[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [studentId, setStudentId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [chargeCode, setChargeCode] = useState("");
  const [description, setDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [studentResult, chargeResult, paymentResult] = await Promise.all([
        apiRequest<{ items: Student[] }>("/students?page=1&pageSize=100"),
        apiRequest<{ items: Charge[] }>("/fees/charges"),
        apiRequest<{ items: Payment[] }>("/fees/payments")
      ]);
      setStudents(studentResult.items);
      setCharges(chargeResult.items);
      setPayments(paymentResult.items);
      if (!studentId && studentResult.items[0]) setStudentId(studentResult.items[0].id);
      if (!chargeId && chargeResult.items.find((item) => Number(item.balance_amount) > 0)) {
        const open = chargeResult.items.find((item) => Number(item.balance_amount) > 0)!;
        setChargeId(open.id);
        setPaymentAmount(String(open.balance_amount));
        setStudentId(open.student_id);
      }
    } catch (cause) { setError(errText(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  const selectedStudent = students.find((student) => student.id === studentId);
  const openCharges = charges.filter((charge) => Number(charge.balance_amount) > 0 && charge.status === "open");
  const selectedCharge = openCharges.find((charge) => charge.id === chargeId);
  const outstanding = charges.reduce((sum, charge) => sum + Number(charge.balance_amount || 0), 0);
  const collected = payments.filter((payment) => payment.status === "posted").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  async function createCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    if (!selectedStudent) { setError("Choose an admitted student first."); setSaving(false); return; }
    try {
      await apiRequest("/fees/charges", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudent.id, admissionId: selectedStudent.admission_id,
          chargeCode: chargeCode.trim(), description: description.trim(),
          amount: Number(chargeAmount), dueDate: dueDate || null
        })
      });
      setChargeCode(""); setDescription(""); setChargeAmount(""); setDueDate("");
      setNotice("Fee charge created and added to the student ledger.");
      await loadData();
    } catch (cause) { setError(errText(cause)); }
    finally { setSaving(false); }
  }

  async function collectPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    if (!selectedCharge) { setError("Choose an open fee charge."); setSaving(false); return; }
    try {
      const result = await apiRequest<{ payment: { receipt_number: string } }>("/fees/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedCharge.student_id, amount: Number(paymentAmount), method,
          reference: reference.trim() || null,
          allocations: [{ chargeId: selectedCharge.id, amount: Number(paymentAmount) }]
        })
      });
      setReference("");
      setNotice("Payment posted successfully. Receipt: " + result.payment.receipt_number);
      await loadData();
    } catch (cause) { setError(errText(cause)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fee-page">
      <div className="directory-heading">
        <div><span className="directory-eyebrow">INSTITUTE FINANCE</span><h2>Fee Management</h2><p>Track student fee charges, allocate collections and retrieve posted receipts.</p></div>
        <div className="directory-total"><strong>{charges.length}</strong><span>fee charges</span></div>
      </div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      <div className="fee-stats">
        <article><span>Outstanding balance</span><strong>{fmtMoney(outstanding)}</strong></article>
        <article><span>Collections posted</span><strong>{fmtMoney(collected)}</strong></article>
        <article><span>Receipts issued</span><strong>{payments.length}</strong></article>
      </div>

      {canManage && <div className="fee-forms">
        <form className="directory-create-form" onSubmit={createCharge}>
          <div className="directory-form-title"><strong>Create fee charge</strong><span>Add a one-time fee item to the selected student's admission ledger.</span></div>
          <div className="fee-form-fields">
            <label>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} · {student.student_number}</option>)}</select></label>
            <label>Charge code<input value={chargeCode} onChange={(event) => setChargeCode(event.target.value)} required maxLength={50} placeholder="TUITION-01" /></label>
            <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={180} placeholder="Term 1 tuition fee" /></label>
            <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} required /></label>
            <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          </div>
          <button className="directory-primary" type="submit" disabled={saving || !students.length || !selectedStudent?.admission_id}>{saving ? "Saving…" : "Create charge"}</button>
          {!students.length && <span className="directory-muted">Admit a student before creating a fee charge.</span>}
        </form>

        <form className="directory-create-form" onSubmit={collectPayment}>
          <div className="directory-form-title"><strong>Collect payment</strong><span>Every payment is allocated to a fee charge and receives a unique receipt number.</span></div>
          <div className="fee-form-fields">
            <label>Open fee charge<select value={chargeId} onChange={(event) => {
              setChargeId(event.target.value);
              const charge = openCharges.find((item) => item.id === event.target.value);
              if (charge) { setPaymentAmount(String(charge.balance_amount)); setStudentId(charge.student_id); }
            }} required><option value="">Select charge</option>{openCharges.map((charge) => <option key={charge.id} value={charge.id}>{charge.student_name} · {charge.description} · Balance {fmtMoney(charge.balance_amount)}</option>)}</select></label>
            <label>Amount (₹)<input type="number" min="0.01" max={selectedCharge ? Number(selectedCharge.balance_amount) : undefined} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label>
            <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="card">Card</option><option value="other">Other</option></select></label>
            <label>Reference / UTR<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} placeholder="Optional transaction reference" /></label>
          </div>
          <button className="directory-primary" type="submit" disabled={saving || !selectedCharge}>{saving ? "Posting…" : "Post payment & issue receipt"}</button>
          {!openCharges.length && <span className="directory-muted">No open fee charges are available for collection.</span>}
        </form>
      </div>}

      <section className="directory-table-card">
        <div className="fee-section-heading"><strong>Student fee ledger</strong><span>{charges.length} charges</span></div>
        {loading ? <div className="directory-empty">Loading fee ledger…</div> : <div className="directory-table-scroll"><table><thead><tr><th>STUDENT</th><th>CHARGE</th><th>DUE DATE</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th></tr></thead><tbody>
          {charges.map((charge) => <tr key={charge.id}><td><strong>{charge.student_name}</strong><small>{charge.student_number} · {charge.admission_number}</small></td><td>{charge.description}<small>{charge.charge_code}</small></td><td>{fmtDate(charge.due_date)}</td><td>{fmtMoney(charge.amount)}</td><td>{fmtMoney(charge.paid_amount)}</td><td><strong>{fmtMoney(charge.balance_amount)}</strong></td></tr>)}
        </tbody></table>{!charges.length && <div className="directory-empty">No fee charges recorded yet.</div>}</div>}
      </section>

      <section className="directory-table-card">
        <div className="fee-section-heading"><strong>Payment receipts</strong><span>{payments.length} payments</span></div>
        <div className="directory-table-scroll"><table><thead><tr><th>RECEIPT</th><th>STUDENT</th><th>DATE</th><th>METHOD</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>
          {payments.map((payment) => <tr key={payment.id}><td><strong>{payment.receipt_number}</strong></td><td>{payment.student_name}<small>{payment.student_number}</small></td><td>{fmtDate(payment.payment_date)}</td><td>{payment.method.replaceAll("_", " ")}</td><td>{fmtMoney(payment.amount)}</td><td><span className="directory-status active">{payment.status}</span></td></tr>)}
        </tbody></table>{!payments.length && <div className="directory-empty">No payment receipts available yet.</div>}</div>
      </section>
    </div>
  );
}
